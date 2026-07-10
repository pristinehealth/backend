import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import JobPosition from '@/models/JobPosition';
import { markImageConsumed } from '@/lib/positionImage';

export const dynamic = 'force-dynamic';

async function isAdmin() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return false;
    const role = (session.user as any).role;
    return role === 'admin' || role === 'superadmin';
}

export async function GET() {
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const jobs = await JobPosition.find({}).sort({ createdAt: -1 }).lean();
        return NextResponse.json(jobs);
    } catch (error: any) {
        console.error("GET /api/admin/jobs error:", error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const body = await request.json();
        const { title, sections, imageUrl, imagePublicId } = body;

        if (!title) {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 });
        }

        if (!sections || !Array.isArray(sections) || sections.length === 0) {
            return NextResponse.json({ error: 'At least one job description section is required' }, { status: 400 });
        }

        const job = await JobPosition.create({
            title,
            sections,
            imageUrl: imageUrl || null,
            imagePublicId: imagePublicId || null,
            status: 'draft',
        });

        // Protect the uploaded image from the abandoned-upload sweep.
        if (job.imageUrl) await markImageConsumed(job.imagePublicId);

        return NextResponse.json({ message: 'Job position created successfully', job }, { status: 201 });
    } catch (error: any) {
        console.error("POST /api/admin/jobs error:", error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
