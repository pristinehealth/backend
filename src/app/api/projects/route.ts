import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import Project from '@/models/Project';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        await dbConnect();

        // Return from local MongoDB instead of Perfex API
        const projects = await Project.find({}).sort({ dateadded: -1, createdAt: -1 }).lean();

        return NextResponse.json(projects);
    } catch (error: any) {
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
