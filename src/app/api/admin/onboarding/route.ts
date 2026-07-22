import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import JobApplication from '@/models/JobApplication';
import JobPosition from '@/models/JobPosition';
import OnboardingForm from '@/models/OnboardingForm';
import OnboardingResponse from '@/models/OnboardingResponse';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

async function isAdmin() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return false;
    const role = (session.user as any).role;
    return role === 'admin' || role === 'superadmin';
}

// List of ACCEPTED applications, each with its onboarding record (or none).
// Filters: ?jobId, ?onboardingStatus (not_started|in_progress|completed), ?q, ?page.
export async function GET(request: Request) {
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const { searchParams } = new URL(request.url);
        const jobId = searchParams.get('jobId') || '';
        const onboardingStatus = searchParams.get('onboardingStatus') || '';
        const q = (searchParams.get('q') || '').trim();
        const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

        const filter: any = { status: 'accepted' };
        if (jobId) filter.jobId = jobId;
        if (q) {
            const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            filter.$or = [{ applicantName: rx }, { applicantEmail: rx }];
        }

        const applications = await JobApplication.find(filter)
            .select('applicantName applicantEmail jobId status createdAt updatedAt')
            .sort({ updatedAt: -1 })
            .lean();

        // Batch-load job titles and onboarding records to avoid N+1.
        const jobIds = Array.from(new Set(applications.map((a: any) => String(a.jobId)).filter(Boolean)));
        const appIds = applications.map((a: any) => a._id);
        const [jobs, responses] = await Promise.all([
            JobPosition.find({ _id: { $in: jobIds } }).select('title').lean(),
            OnboardingResponse.find({ applicationId: { $in: appIds } })
                .select('applicationId onboardingFormId status startedByEmail completedAt updatedAt')
                .lean(),
        ]);
        const jobTitleById = new Map(jobs.map((j: any) => [String(j._id), j.title]));
        const responseByAppId = new Map(responses.map((r: any) => [String(r.applicationId), r]));

        let rows = applications.map((app: any) => {
            const onboarding = responseByAppId.get(String(app._id)) || null;
            return {
                _id: app._id,
                applicantName: app.applicantName,
                applicantEmail: app.applicantEmail,
                jobId: app.jobId,
                jobTitle: jobTitleById.get(String(app.jobId)) || 'Unknown Position',
                acceptedAt: app.updatedAt,
                onboarding: onboarding
                    ? {
                          _id: onboarding._id,
                          onboardingFormId: onboarding.onboardingFormId,
                          status: onboarding.status,
                          completedAt: onboarding.completedAt || null,
                          updatedAt: onboarding.updatedAt,
                      }
                    : null,
                onboardingStatus: onboarding ? onboarding.status : 'not_started',
            };
        });

        if (onboardingStatus === 'not_started' || onboardingStatus === 'in_progress' || onboardingStatus === 'completed') {
            rows = rows.filter((r) => r.onboardingStatus === onboardingStatus);
        }

        const total = rows.length;
        const start = (page - 1) * PAGE_SIZE;
        const data = rows.slice(start, start + PAGE_SIZE);

        return NextResponse.json({ data, total, page, pageSize: PAGE_SIZE });
    } catch (error: any) {
        console.error('GET /api/admin/onboarding error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}

// Start onboarding for an accepted application with a chosen questionnaire.
export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        const role = (session?.user as any)?.role;
        if (!session?.user || (role !== 'admin' && role !== 'superadmin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const body = await request.json();
        const applicationId = (body?.applicationId || '').toString();
        const onboardingFormId = (body?.onboardingFormId || '').toString();

        if (!applicationId || !onboardingFormId) {
            return NextResponse.json({ error: 'applicationId and onboardingFormId are required' }, { status: 400 });
        }

        const application = await JobApplication.findById(applicationId);
        if (!application) {
            return NextResponse.json({ error: 'Application not found' }, { status: 404 });
        }
        if (application.status !== 'accepted') {
            return NextResponse.json({ error: 'Onboarding can only be started for accepted applications.' }, { status: 400 });
        }

        const form = await OnboardingForm.findById(onboardingFormId).select('_id').lean();
        if (!form) {
            return NextResponse.json({ error: 'Onboarding questionnaire not found' }, { status: 404 });
        }

        const existing = await OnboardingResponse.findOne({ applicationId });
        if (existing) {
            return NextResponse.json({ error: 'Onboarding has already been started for this candidate.' }, { status: 409 });
        }

        const created = await OnboardingResponse.create({
            applicationId,
            onboardingFormId,
            jobId: application.jobId,
            applicantName: application.applicantName,
            applicantEmail: application.applicantEmail,
            status: 'in_progress',
            startedByEmail: session.user.email || '',
        });

        return NextResponse.json({ message: 'Onboarding started', data: created }, { status: 201 });
    } catch (error: any) {
        console.error('POST /api/admin/onboarding error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
