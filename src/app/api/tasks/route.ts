import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import Task from '@/models/Task';
import Timesheet from '@/models/Timesheet';
import Staff from '@/models/Staff';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        await dbConnect();
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseInt(searchParams.get('limit') || '50', 10);
        const skip = (page - 1) * limit;

        // Return from local MongoDB instead of Perfex API
        const total = await Task.countDocuments({});
        const rawTasks = await Task.find({})
            .sort({ dateadded: -1, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        // Hydrate Tasks with Timesheet History & Staff Names
        const tasks = await Promise.all(rawTasks.map(async (task: any) => {
            const timesheets = await Timesheet.find({ task_id: task.id }).lean();

            // Hydrate the caregiver's name onto each timesheet
            const enrichedTimesheets = await Promise.all(timesheets.map(async (ts: any) => {
                const staff = await Staff.findOne({ staffid: ts.staff_id }).lean();
                return {
                    ...ts,
                    staff_name: staff ? `${staff.firstname} ${staff.lastname}`.trim() : `Staff #${ts.staff_id}`
                };
            }));

            // Sort timesheets chronologically (oldest first, or newest first depending on preference - we'll do newest first)
            enrichedTimesheets.sort((a, b) => Number(b.start_time) - Number(a.start_time));

            return {
                ...task,
                timesheets: enrichedTimesheets
            };
        }));

        return NextResponse.json({
            data: tasks,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error: any) {
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
