import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import Staff from '@/models/Staff';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        await dbConnect();

        // Fetch staff from local database instead of Perfex
        const staffList = await Staff.find({}).lean();

        // Optional: Return an empty array if none found to match RTK expectations, or specific format
        return NextResponse.json(staffList);
    } catch (error: any) {
        console.error('Error fetching staff from local DB:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', details: error.message },
            { status: 500 }
        );
    }
}
