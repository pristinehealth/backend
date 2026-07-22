import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import JobPosition from '@/models/JobPosition';
import JobApplication from '@/models/JobApplication';
import { markImageConsumed } from '@/lib/positionImage';
import { LOCATION_SET } from '@/lib/usStates';

export const dynamic = 'force-dynamic';

async function isAdmin() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return false;
    const role = (session.user as any).role;
    return role === 'admin' || role === 'superadmin';
}

// Paginated + optionally state-filtered list of job positions, each enriched
// with its application count. Returns { data, total, page, pageSize }.
// `?limit=0` returns all positions (used where a full list is needed, e.g. the
// onboarding position picker).
export async function GET(request: Request) {
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const { searchParams } = new URL(request.url);
        const state = searchParams.get('state') || '';
        const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
        const rawLimit = parseInt(searchParams.get('limit') || '10', 10);
        const unbounded = rawLimit === 0;
        const limit = unbounded ? 0 : Math.min(100, Math.max(1, rawLimit || 10));

        const filter: any = {};
        if (state && LOCATION_SET.has(state)) filter.location = state;

        const total = await JobPosition.countDocuments(filter);

        let query = JobPosition.find(filter).sort({ createdAt: -1 });
        if (!unbounded) query = query.skip((page - 1) * limit).limit(limit);
        const jobs = await query.lean();

        // Application counts for just this page's jobs (one aggregation).
        const jobIds = jobs.map((j: any) => j._id);
        const counts = jobIds.length
            ? await JobApplication.aggregate([
                { $match: { jobId: { $in: jobIds } } },
                { $group: { _id: '$jobId', count: { $sum: 1 } } },
            ])
            : [];
        const countByJob = new Map(counts.map((c: any) => [String(c._id), c.count]));
        const data = jobs.map((j: any) => ({ ...j, applicationCount: countByJob.get(String(j._id)) || 0 }));

        return NextResponse.json({ data, total, page, pageSize: unbounded ? total : limit });
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
        const { title, location, city, sections, imageUrl, imagePublicId } = body;

        if (!title) {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 });
        }

        if (!sections || !Array.isArray(sections) || sections.length === 0) {
            return NextResponse.json({ error: 'At least one job description section is required' }, { status: 400 });
        }

        const job = await JobPosition.create({
            title,
            location: (typeof location === 'string' && LOCATION_SET.has(location)) ? location : null,
            city: (typeof city === 'string' && city.trim()) ? city.trim() : null,
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
