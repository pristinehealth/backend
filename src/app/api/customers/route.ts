import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import Customer from '@/models/Customer';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        await dbConnect();

        // Return from local MongoDB instead of Perfex API
        const customers = await Customer.find({}).sort({ createdAt: -1 }).lean();

        return NextResponse.json(customers);
    } catch (error: any) {
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
