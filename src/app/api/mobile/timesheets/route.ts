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

        // 1. Fetch completed timesheets for this staff member
        // Exclude active timesheets: end_time can be null, "", "0" (string) or 0 (integer)
        const query = {
            staff_id: staffid.toString(),
            end_time: { $nin: [null, "", "0", 0], $exists: true }
        };

        const totalTimesheets = await Timesheet.countDocuments(query);

        // Fetch ALL matching timesheets, sort globally, then paginate manually.
        // This is necessary because end_time is stored in mixed formats (UNIX int string
        // vs "YYYY-MM-DD HH:MM:SS") so MongoDB can't sort them natively.
        const allTimesheets = await Timesheet.find(query).lean();

        // Normalise end_time to ms — handles UNIX seconds strings and datetime strings
        const toMs = (t: any): number => {
            const v = String(t.end_time || '0');
            if (/^\d{10,}$/.test(v)) return parseInt(v) * 1000;   // UNIX seconds → ms
            const parsed = new Date(v.replace(' ', 'T')).getTime();
            return isNaN(parsed) ? 0 : parsed;
        };

        allTimesheets.sort((a, b) => toMs(b) - toMs(a)); // newest end_time first

        // Paginate after sorting
        const rawTimesheets = allTimesheets.slice(startParam, startParam + lengthParam);

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
