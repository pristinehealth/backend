import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import dbConnect from '@/lib/mongoose';
import Staff from '@/models/Staff';
import ServiceReport from '@/models/ServiceReport';
import Project from '@/models/Project';
import Timesheet from '@/models/Timesheet';
import { uploadBase64Image } from '@/lib/cloudinary';
import { getIO } from '@/lib/socket';
import { fetchPerfex } from '@/lib/perfex';

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
            // ── Guard: prevent clocking into two shifts simultaneously ──────────
            const TaskModel = (await import('@/models/Task')).default;
            const activeTask = await TaskModel.findOne({
                status: '4',
                $or: [
                    { 'assignees.assigneeid': String(staff_id) },
                    { assignees: String(staff_id) }
                ]
            }).lean();

            if (activeTask) {
                return NextResponse.json(
                    { error: 'You are already clocked into another shift. Please stop that shift before starting a new one.' },
                    { status: 409 }
                );
            }
            // ─────────────────────────────────────────────────────────────────────

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
                    const allowedRadius = radiusField && !isNaN(parseFloat(radiusField.value)) ? parseFloat(radiusField.value) : 50;

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

            const response = await fetchPerfex('/timesheets', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                return NextResponse.json({ error: 'Failed to start timesheet in Perfex' }, { status: response.status });
            }

            // ── Sync status 4 (In Progress) to Perfex — non-blocking ─────────────
            // Fire-and-warn: a failure here doesn't block the shift start.
            // Include rel_type/rel_id so Perfex doesn't tear down project links on PUT.
            try {
                const perfexTaskPayload: any = { status: '4' };
                if (taskDoc?.rel_type) perfexTaskPayload.rel_type = taskDoc.rel_type;
                else if (taskDoc?.project_data?.id) perfexTaskPayload.rel_type = 'project';
                if (taskDoc?.rel_id) perfexTaskPayload.rel_id = taskDoc.rel_id;
                else if (taskDoc?.project_data?.id) perfexTaskPayload.rel_id = taskDoc.project_data.id;

                const perfexStatusRes = await fetchPerfex(`/tasks/${task_id}`, {
                    method: 'PUT',
                    body: JSON.stringify(perfexTaskPayload)
                });
                if (!perfexStatusRes.ok) {
                    console.warn(`[Perfex] Failed to set task ${task_id} → status 4:`, await perfexStatusRes.text());
                } else {
                    console.log(`[Perfex] Task ${task_id} → status 4 (In Progress).`);
                }
            } catch (perfexStatusErr) {
                console.warn('[Perfex] Error syncing In Progress status:', perfexStatusErr);
            }
            // ─────────────────────────────────────────────────────────────────────

            // ── Write-through: persist new timesheet locally after confirmed Perfex success ──
            // Only runs after a 2xx from Perfex — never written speculatively.
            try {
                let newTimesheetId: string | null = null;

                // 1. Try to extract ID directly from the POST response body
                try {
                    const perfexBody = await response.json();
                    const candidate = String(perfexBody?.id || perfexBody?.timesheetid || '');
                    if (candidate && candidate !== 'undefined') newTimesheetId = candidate;
                } catch { /* response body not parseable — fall through to GET lookup */ }

                // 2. Safety net: if Perfex didn't return an ID in the response body,
                //    do a single targeted GET to find the open timesheet we just created.
                //    This is a one-time call on shift start only — never at read time.
                if (!newTimesheetId) {
                    console.warn('[Write-Through] Perfex POST response missing ID — falling back to GET lookup.');
                    try {
                        const lookupRes = await fetchPerfex(`/timesheets?task_id=${task_id}&staff_id=${staff_id}`);
                        if (lookupRes.ok) {
                            const lookupData = await lookupRes.json();
                            const lookupList: any[] = Array.isArray(lookupData) ? lookupData
                                : (lookupData?.data ? lookupData.data : []);
                            const open = lookupList
                                .filter(ts => String(ts.staff_id) === String(staff_id)
                                    && (ts.end_time === null || ts.end_time === '0' || !ts.end_time))
                                .sort((a, b) => Number(b.start_time || 0) - Number(a.start_time || 0))[0];
                            if (open?.id) {
                                newTimesheetId = String(open.id);
                                console.log(`[Write-Through] GET fallback resolved timesheet ID: ${newTimesheetId}`);
                            }
                        }
                    } catch (lookupErr) {
                        console.error('[Write-Through] GET fallback failed:', lookupErr);
                    }
                }

                if (newTimesheetId) {
                    // Upsert standalone Timesheet document
                    await Timesheet.findOneAndUpdate(
                        { id: newTimesheetId },
                        { $set: { id: newTimesheetId, task_id: String(task_id), staff_id: String(staff_id), start_time: String(start_time), end_time: '0', note: note || 'Shift started via Mobile App' } },
                        { upsert: true, new: true }
                    );

                    // 1. Pull any stale entry with the same ID (de-dup guard)
                    const TaskModel = (await import('@/models/Task')).default;
                    await TaskModel.updateOne(
                        { id: task_id },
                        { $pull: { timesheets: { id: newTimesheetId } } }
                    );

                    // 2. Push the new timesheet entry + flip status to In Progress in one shot
                    await TaskModel.updateOne(
                        { id: task_id, status: { $ne: '5' } },
                        {
                            $push: { timesheets: { id: newTimesheetId, task_id: String(task_id), staff_id: String(staff_id), start_time: String(start_time), end_time: '0' } },
                            $set: { status: '4' }
                        }
                    );
                    console.log(`[Write-Through] Timesheet ${newTimesheetId} saved, Task ${task_id} → In Progress.`);
                } else {
                    // Extremely rare: both POST body and GET fallback failed to return an ID.
                    // The nightly cron will reconcile. Stop-shift will fall back to its own
                    // Perfex GET lookup to find the active timer.
                    // Still update status to In Progress even without a timesheet ID.
                    const TaskModel = (await import('@/models/Task')).default;
                    await TaskModel.updateOne(
                        { id: task_id, status: { $ne: '5' } },
                        { $set: { status: '4' } }
                    );
                    console.error('[Write-Through] Could not resolve timesheet ID from Perfex — nightly cron will reconcile.');
                }
            } catch (localWriteErr) {
                // Non-fatal: Perfex write succeeded, nightly cron will reconcile
                console.error('[Write-Through] Failed to persist start timesheet locally:', localWriteErr);
            }
            // ─────────────────────────────────────────────────────────────────────

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
            const responseTS = await fetchPerfex(`/timesheets/${activeNativeId}`, {
                method: 'PUT',
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
            }

            // ── Write-through: update Timesheet + Task in MongoDB after confirmed Perfex success ──
            try {
                // Close the local Timesheet record
                await Timesheet.findOneAndUpdate(
                    { id: activeNativeId },
                    { $set: { end_time: String(end_time), note: compiledNote } }
                );

                // Mark task as completed locally + close its embedded timesheet entry
                await taskDoc?.constructor.updateOne(
                    { id: task_id },
                    {
                        $set: {
                            status: '5',
                            'timesheets.$[entry].end_time': String(end_time),
                            'timesheets.$[entry].note': compiledNote,
                        }
                    },
                    { arrayFilters: [{ 'entry.id': activeNativeId }] }
                );
                console.log(`[Write-Through] Updated Timesheet ${activeNativeId} and Task ${task_id} status to 5 in MongoDB.`);
            } catch (localWriteErr) {
                // Non-fatal: Perfex write succeeded, nightly cron will reconcile
                console.error('[Write-Through] Failed to update stop timesheet/task locally:', localWriteErr);
            }
            // ─────────────────────────────────────────────────────────────────────

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

            const taskUpdateRes = await fetchPerfex(`/tasks/${task_id}`, {
                method: 'PUT',
                body: JSON.stringify(taskUpdatePayload)
            });

            if (!taskUpdateRes.ok) {
                console.error(`[Mobile API] Failed to mark task ${task_id} as status 5 in Perfex`, await taskUpdateRes.text());
                return NextResponse.json({ error: `Failed to mark task as completed in CRM: ${taskUpdateRes.statusText}` }, { status: taskUpdateRes.status });
            }
            // ----------------------------------------------

            // ── Real-time notification ────────────────────────────────────
            // Push shift:ended to the caregiver's personal socket room so the
            // mobile app can auto-refresh without a manual pull-to-refresh.
            try {
                getIO().to(`staff:${staff_id}`).emit('shift:ended', {
                    task_id,
                    staff_id,
                    timestamp: Date.now(),
                });
                console.log(`[Socket.IO] Emitted shift:ended → room staff:${staff_id}`);
            } catch (socketErr) {
                // Non-fatal — socket emission failure must not block the HTTP response
                console.warn('[Socket.IO] Failed to emit shift:ended:', socketErr);
            }
            // ─────────────────────────────────────────────────────────────

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
