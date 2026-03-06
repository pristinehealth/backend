import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import dbConnect from '@/lib/mongoose';
import Staff from '@/models/Staff';
import ServiceReport from '@/models/ServiceReport';
import Project from '@/models/Project';
import { uploadBase64Image } from '@/lib/cloudinary';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret-please-change-in-prod';
const PERFEX_ENDPOINT = process.env.PERFEX_ENDPOINT;
const PERFEX_ADMIN_TOKEN = process.env.PERFEX_ADMIN_TOKEN;

// Server-side Haversine Distance computation
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth radius in meters
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

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
        const { task_id, action, note, checklist_items, questionnaire, customer_signature, staff_signature, user_lat, user_lng } = body;

        if (!task_id || !action) {
            return NextResponse.json({ error: 'task_id and action (start/stop) are required' }, { status: 400 });
        }

        await dbConnect();

        // ---------------------------------------------------------
        // ACTION: START SHIFT
        // Create a new Timesheet with no end time (end_time = '0')
        // ---------------------------------------------------------
        if (action === 'start') {
            // Retrieve root Task object to check Project associations
            const TaskModel = (await import('@/models/Task')).default;
            const taskDoc = await TaskModel.findOne({ id: task_id });

            // If coordinates were submitted, it means the facility mandates a geofence check
            if (user_lat !== undefined && user_lng !== undefined && taskDoc && taskDoc.project_data && taskDoc.project_data.id) {
                const proj = await Project.findOne({ id: taskDoc.project_data.id }).lean();
                if (proj && proj.customfields) {
                    const latField = proj.customfields.find((f: any) => f.label?.toLowerCase().includes("latitude"));
                    const lngField = proj.customfields.find((f: any) => f.label?.toLowerCase().includes("longitude"));
                    const radiusField = proj.customfields.find((f: any) => f.label?.toLowerCase().includes("radius"));

                    const targetLat = latField?.value ? parseFloat(latField.value) : null;
                    const targetLng = lngField?.value ? parseFloat(lngField.value) : null;
                    const allowedRadius = radiusField && !isNaN(parseFloat(radiusField.value)) ? parseFloat(radiusField.value) : 20;

                    // If the project natively defines GPS coordinates
                    if (targetLat !== null && !isNaN(targetLat) && targetLng !== null && !isNaN(targetLng)) {
                        const dist = getDistance(parseFloat(user_lat), parseFloat(user_lng), targetLat, targetLng);

                        if (dist > allowedRadius) {
                            return NextResponse.json(
                                { error: `Out of Range. You are ${Math.round(dist)}m away from the facility.` },
                                { status: 403 }
                            );
                        }
                    }
                }
            }

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
            const time_taken = new Date();

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

            // --- SAVE ServiceReport TO MONGODB ---
            try {
                let parsedCustomerSignature = null;
                let parsedStaffSignature = null;

                if (customer_signature && typeof customer_signature === 'string' && customer_signature.startsWith('data:image')) {
                    parsedCustomerSignature = await uploadBase64Image(customer_signature, 'pristine/signatures');
                }

                if (staff_signature && typeof staff_signature === 'string' && staff_signature.startsWith('data:image')) {
                    parsedStaffSignature = await uploadBase64Image(staff_signature, 'pristine/signatures');
                }

                await ServiceReport.create({
                    task_id: String(task_id),
                    timesheet_id: activeNativeId,
                    staff_id: String(staff_id),
                    time_taken: time_taken,
                    note: note,
                    questionnaire: questionnaire || [],
                    checklist_items: checklist_items || [],
                    customer_signature: parsedCustomerSignature ? {
                        url: parsedCustomerSignature.url,
                        public_id: parsedCustomerSignature.public_id,
                        provider: parsedCustomerSignature.provider
                    } : null,
                    staff_signature: parsedStaffSignature ? {
                        url: parsedStaffSignature.url,
                        public_id: parsedStaffSignature.public_id,
                        provider: parsedStaffSignature.provider
                    } : null
                });
                console.log(`[Mobile API] Successfully saved ServiceReport to MongoDB for task ${task_id}`);
            } catch (srErr) {
                console.error(`[Mobile API] Failed to save ServiceReport to MongoDB:`, srErr);
                // We do not fail the request because the CRM update succeeded, 
                // but we log the error aggressively.
            }
            // -------------------------------------

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
