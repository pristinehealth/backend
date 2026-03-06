import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import Task, { TaskDocument } from '@/models/Task';
import Project from '@/models/Project';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret-please-change-in-prod';

export async function GET(req: Request) {
    try {
        // 1. Extract the JWT from the Authorization header
        const authHeader = req.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized: Missing or invalid token' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];

        // 2. Verify the token and extract the staffid
        let decodedToken: any;
        try {
            decodedToken = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            return NextResponse.json({ error: 'Unauthorized: Token is invalid or expired' }, { status: 401 });
        }

        const staffid = decodedToken.userid;
        if (!staffid) {
            return NextResponse.json({ error: 'Unauthorized: Token payload missing userid' }, { status: 401 });
        }

        // 3. Check if mobile user requested a hard refresh of Perfex upstream
        const url = new URL(req.url);
        if (url.searchParams.get('refresh') === 'true') {
            try {
                // Command a scoped sync to explicitly fetch only what the mobile dashboard 
                // cares about (Tasks and Timesheets) utilizing the optimized start/length loops.
                await fetch(`${process.env.PUBLIC_BASE_URL}/api/sync/scoped`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${process.env.CRON_SECRET || 'pristine-cron-secret'}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ resources: ['tasks', 'timesheets', 'projects'] })
                });
                console.log(`[Mobile API] Scoped Refresh (tasks, timesheets, projects) commanded by Staff ID ${staffid}`);
            } catch (syncErr) {
                console.error("[Mobile API] Failed to orchestrate implicit scoped sync", syncErr);
            }
        }

        const startParam = parseInt(url.searchParams.get('start') || '0', 10);
        const lengthParam = parseInt(url.searchParams.get('length') || '25', 10);

        // 4. Connect to the database
        await dbConnect();

        // 5. Query Tasks assigned to this staff member
        // Perfex assignees can sometimes be stored as an array of objects [{assigneeid: '1'}] 
        // or potentially flattened strings depending on the sync parse. We check both.
        const query = {
            $or: [
                { 'assignees.assigneeid': staffid.toString() },
                { 'assignees': staffid.toString() }
            ]
        };

        const totalTasks = await Task.countDocuments(query);

        // Sort: put status=5 (completed) tasks by most recently added/finished, active tasks by startdate.
        // We use a compound sort: status ascending (so "5" = completed is last in active view but fetched together)
        // then datefinished desc (for completed), then startdate desc (for active).
        // This ensures the page slice is useful regardless of which filter the user is on.
        const rawTasks = await Task.find(query)
            .sort({ datefinished: -1, startdate: -1, dateadded: -1 })
            .skip(startParam)
            .limit(lengthParam)
            .lean();

        // Hydrate Project Custom Fields
        // Perfex's native Tasks API does not include deep project custom fields (which hold GPS lat/lng)
        // We stitch them back in manually here before shipping the payload down to Mobile.
        const tasks = await Promise.all(rawTasks.map(async (task: any) => {
            if (task.project_data && task.project_data.id) {
                const proj = await Project.findOne({ id: task.project_data.id }).select('customfields').lean();
                if (proj && proj.customfields) {
                    task.project_data.customfields = proj.customfields;

                    // Explicitly hoist the address strings for mobile list rendering
                    const addressField = proj.customfields.find((f: any) => f.label?.toLowerCase().includes("address"));
                    const cityField = proj.customfields.find((f: any) => f.label?.toLowerCase().includes("city"));
                    const stateField = proj.customfields.find((f: any) => f.label?.toLowerCase().includes("state") || f.label?.toLowerCase() === "st");

                    task.project_data.extracted_address = addressField?.value || "";
                    task.project_data.extracted_city = cityField?.value || "";
                    task.project_data.extracted_state = stateField?.value || "";
                }
            }
            return task;
        }));

        return NextResponse.json({
            success: true,
            meta: {
                total: totalTasks,
                start: startParam,
                length: lengthParam
            },
            count: tasks.length,
            data: tasks
        });

    } catch (error: any) {
        console.error('Error fetching contextual mobile tasks:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
