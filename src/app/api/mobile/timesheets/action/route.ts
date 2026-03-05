import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import dbConnect from '@/lib/mongoose';
import Staff from '@/models/Staff';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret-please-change-in-prod';
const PERFEX_ENDPOINT = process.env.PERFEX_ENDPOINT;
const PERFEX_ADMIN_TOKEN = process.env.PERFEX_ADMIN_TOKEN;

export async function POST(req: Request) {
    try {
        if (!PERFEX_ENDPOINT || !PERFEX_ADMIN_TOKEN) {
            return NextResponse.json({ error: 'Server missing Perfex credentials' }, { status: 500 });
        }

        const authHeader = req.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized: Missing or invalid token' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        let decodedToken: any;
        try {
            decodedToken = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            return NextResponse.json({ error: 'Unauthorized: Token is invalid or expired' }, { status: 401 });
        }

        const staff_id = decodedToken.userid;
        if (!staff_id) {
            return NextResponse.json({ error: 'Unauthorized: Token payload missing userid' }, { status: 401 });
        }

        const body = await req.json();
        const { task_id, action, note, checklist_items, questionnaire } = body;

        if (!task_id || !action) {
            return NextResponse.json({ error: 'task_id and action (start/stop) are required' }, { status: 400 });
        }

        await dbConnect();

        // ---------------------------------------------------------
        // ACTION: START SHIFT
        // Create a new Timesheet with no end time (end_time = '0')
        // ---------------------------------------------------------
        if (action === 'start') {
            const start_time = Math.floor(Date.now() / 1000);

            const formData = new FormData();
            formData.append('task_id', String(task_id));
            formData.append('staff_id', String(staff_id));
            formData.append('start_time', String(start_time));
            formData.append('end_time', '0'); // CRM accepts 0 for active/ongoing
            formData.append('hourly_rate', '0');
            formData.append('note', note || 'Shift started via Mobile App');

            const response = await fetch(`${PERFEX_ENDPOINT}/timesheets`, {
                method: 'POST',
                headers: { 'authtoken': PERFEX_ADMIN_TOKEN },
                body: formData
            });

            if (!response.ok) {
                return NextResponse.json({ error: 'Failed to start timesheet in Perfex' }, { status: response.status });
            }

            // Trigger sync
            fetch(`${process.env.PUBLIC_BASE_URL}/api/sync/all`, { method: 'POST' }).catch(console.error);

            return NextResponse.json({
                success: true,
                message: 'Shift timesheet created securely in CRM.',
                data: { start_time }
            });
        }

        // ---------------------------------------------------------
        // ACTION: STOP SHIFT
        // Update the active native timesheet with an end time
        // ---------------------------------------------------------
        if (action === 'stop') {
            let activeNativeId: string | undefined;

            // Query the local Task DB cache to find the active timesheet ID
            const TaskModel = (await import('@/models/Task')).default;
            const taskDoc = await TaskModel.findOne({ id: task_id });

            if (taskDoc && taskDoc.timesheets) {
                // Find timesheets that might be open: end_time is null, or it's "0"
                const activeNative = taskDoc.timesheets.find((ts: any) =>
                    (ts.end_time === null || ts.end_time === '0' || !ts.end_time) && String(ts.staff_id) === String(staff_id)
                );
                if (activeNative) activeNativeId = String(activeNative.id);
            }

            if (!activeNativeId) {
                return NextResponse.json({ error: 'No active CRM timer found for this task to stop.' }, { status: 400 });
            }

            const end_time = Math.floor(Date.now() / 1000); // CRM strict int payload for PUT updates

            // Format comprehensive Daily Notes
            let compiledNote = note ? `Shift Notes:\n${note}\n\n` : '';
            if (questionnaire && Array.isArray(questionnaire) && questionnaire.length > 0) {
                compiledNote += `--- CLINICAL Q&A ---\n`;
                questionnaire.forEach((q: any) => {
                    compiledNote += `Q: ${q.question}\nA: ${q.answer}\n\n`;
                });
            }
            if (checklist_items && Array.isArray(checklist_items) && checklist_items.length > 0) {
                compiledNote += `Checklist Items:\n`;
                checklist_items.forEach((item: any) => {
                    compiledNote += `${item.finished === "1" ? '[X]' : '[ ]'} ${item.description}\n`;
                });
                compiledNote += `\n`;
            }
            if (!compiledNote.trim()) compiledNote = "Completed via Pristine Mobile App";

            const timesheetPayload = {
                end_time: end_time,
                note: compiledNote
            };
            console.log(`[Mobile API] Emitting PUT /timesheets/${activeNativeId} with payload:`, JSON.stringify(timesheetPayload));

            const responseTS = await fetch(`${PERFEX_ENDPOINT}/timesheets/${activeNativeId}`, {
                method: 'PUT',
                headers: {
                    'authtoken': PERFEX_ADMIN_TOKEN,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(timesheetPayload)
            });

            if (!responseTS.ok) {
                console.error('Failed PUT to timesheet', await responseTS.text());
                return NextResponse.json({ error: `Failed to update timesheet in Perfex: ${responseTS.statusText}` }, { status: responseTS.status });
            }

            // Mark the task as Completed (status 5) per user instruction
            const taskUpdatePayload: any = { status: "5" };

            // Perfex aggressively tears down relational links on PUT unless explicitly provided
            // We fallback to `project_data.id` because Perfex sometimes delivers Tasks with
            // null root rel fields despite retaining a project_data nested object.
            if (taskDoc?.rel_type) {
                taskUpdatePayload.rel_type = taskDoc.rel_type;
            } else if (taskDoc?.project_data?.id) {
                taskUpdatePayload.rel_type = 'project';
            }

            if (taskDoc?.rel_id) {
                taskUpdatePayload.rel_id = taskDoc.rel_id;
            } else if (taskDoc?.project_data?.id) {
                taskUpdatePayload.rel_id = taskDoc.project_data.id;
            }

            console.log(`[Mobile API] Emitting PUT /tasks/${task_id} with payload:`, JSON.stringify(taskUpdatePayload));

            const taskUpdateRes = await fetch(`${PERFEX_ENDPOINT}/tasks/${task_id}`, {
                method: 'PUT',
                headers: {
                    'authtoken': PERFEX_ADMIN_TOKEN,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(taskUpdatePayload)
            });

            if (!taskUpdateRes.ok) {
                console.error(`[Mobile API] Failed to mark task ${task_id} as status 5 in Perfex`, await taskUpdateRes.text());
                return NextResponse.json({ error: `Failed to mark task as completed in CRM: ${taskUpdateRes.statusText}` }, { status: taskUpdateRes.status });
            }
            // ----------------------------------------------

            // Sync down new data
            fetch(`${process.env.PUBLIC_BASE_URL}/api/sync/all`, { method: 'POST' }).catch(console.error);

            return NextResponse.json({
                success: true,
                message: 'Timesheet successfully completed and shipped to Perfex!'
            });
        }

        return NextResponse.json({ error: 'Invalid action payload' }, { status: 400 });

    } catch (error: any) {
        console.error('Error posting timesheet action:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
