import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import Timesheet from '@/models/Timesheet';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        await dbConnect();

        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseInt(searchParams.get('limit') || '50', 10);
        const skip = (page - 1) * limit;

        // Return from local MongoDB instead of Perfex API
        const total = await Timesheet.countDocuments({});
        const timesheets = await Timesheet.find({})
            .sort({ start_time: -1, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        return NextResponse.json({
            data: timesheets,
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
