import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import JobPosition from '@/models/JobPosition';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        await dbConnect();
        // Publicly, we only list "open" job positions
        const jobs = await JobPosition.find({ status: 'open' }).sort({ createdAt: -1 }).lean();
        return NextResponse.json(jobs);
    } catch (error: any) {
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
