import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import Timesheet from '@/models/Timesheet';
import Task from '@/models/Task';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret-please-change-in-prod';

export async function GET(req: Request) {
    try {
        const authHeader = req.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        let decodedToken: any;
        try {
            decodedToken = jwt.verify(token, JWT_SECRET);
        } catch {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        const staffid = decodedToken.userid;
        if (!staffid) return NextResponse.json({ error: 'Payload missing userid' }, { status: 401 });

        const url = new URL(req.url);
        const startParam = parseInt(url.searchParams.get('start') || '0', 10);
        const lengthParam = parseInt(url.searchParams.get('length') || '25', 10);

        await dbConnect();

        // 1. Fetch timesheets where end_time exists and staff_id matches
        const query = {
            staff_id: staffid.toString(),
            end_time: { $ne: null, $nin: ["", "0"] }
        };

        const totalTimesheets = await Timesheet.countDocuments(query);
        const rawTimesheets = await Timesheet.find(query)
            .sort({ start_time: -1 }) // Descending: Newest first
            .skip(startParam)
            .limit(lengthParam)
            .lean();

        // 2. Hydrate task names on the fly
        const taskIds = [...new Set(rawTimesheets.map(t => t.task_id))];
        const linkedTasks = await Task.find({ id: { $in: taskIds } }).select('id name').lean();
        const taskMap: Record<string, string> = {};
        linkedTasks.forEach((t: any) => { taskMap[t.id] = t.name; });

        const hydrated = rawTimesheets.map((ts: any) => ({
            ...ts,
            task_name: taskMap[ts.task_id] || 'Unknown Shift'
        }));

        return NextResponse.json({
            success: true,
            meta: { total: totalTimesheets, start: startParam, length: lengthParam },
            count: hydrated.length,
            data: hydrated
        });

    } catch (error) {
        console.error('Error fetching mobile timesheets:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
