import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import Task from '@/models/Task';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret-please-change-in-prod';

/**
 * GET /api/mobile/timesheets/[id]
 * Looks up a specific timesheet by its Perfex native ID cross-referencing the Task cache.
 * This avoids the previous approach of fetching all tasks and scanning for the timesheet,
 * which fails when the owning task is on a later paginated page.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const authHeader = req.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const token = authHeader.split(' ')[1];
        jwt.verify(token, JWT_SECRET); // throws if invalid

        await dbConnect();
        const { id: timesheetId } = await params;

        // Find the Task that owns this timesheet by scanning the embedded timesheets array.
        const task = await Task.findOne({ 'timesheets.id': timesheetId }).lean() as any;

        if (!task) {
            return NextResponse.json({ error: 'Timesheet not found' }, { status: 404 });
        }

        const timesheet = task.timesheets?.find((ts: any) => String(ts.id) === String(timesheetId));

        if (!timesheet) {
            return NextResponse.json({ error: 'Timesheet not found in task' }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            timesheet,
            task: {
                id: task.id,
                name: task.name,
                description: task.description,
                status: task.status,
                project_data: task.project_data,
                checklist_items: task.checklist_items,
                customfields: task.customfields,
            }
        });
    } catch (error: any) {
        console.error('[Mobile API] Error fetching timesheet by ID:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
