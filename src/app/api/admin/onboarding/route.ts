import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import JobApplication from '@/models/JobApplication';
import JobPosition from '@/models/JobPosition';
import OnboardingForm from '@/models/OnboardingForm';
import OnboardingResponse from '@/models/OnboardingResponse';
import OnboardingInvite from '@/models/OnboardingInvite';
import { rollUpOnboarding } from '@/lib/onboardingProgress';
import { getComplianceRequirements } from '@/lib/compliance';
import { resolveEmployeeRecordIdByEmail } from '@/lib/employeeRecord';

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

        // Batch-load job titles and onboarding records to avoid N+1. A candidate
        // may hold several questionnaires, so responses are grouped per
        // application rather than looked up one-to-one.
        const jobIds = Array.from(new Set(applications.map((a: any) => String(a.jobId)).filter(Boolean)));
        const appIds = applications.map((a: any) => a._id);
        const [jobs, responses, invites, complianceReqs] = await Promise.all([
            JobPosition.find({ _id: { $in: jobIds } }).select('title').lean(),
            OnboardingResponse.find({ applicationId: { $in: appIds } })
                .select('applicationId onboardingFormId formName order status assignee answeredCount totalCount requiredCount startedByEmail completedAt createdAt updatedAt')
                .sort({ order: 1, createdAt: 1 })
                .lean(),
            OnboardingInvite.find({ applicationId: { $in: appIds } })
                .select('applicationId status expiresAt onboardingFormIds requestedDocumentKeys updatedAt')
                .lean(),
            getComplianceRequirements(),
        ]);
        const jobTitleById = new Map(jobs.map((j: any) => [String(j._id), j.title]));
        const reqLabelByKey = new Map((complianceReqs as any[]).map((r) => [r.key, r.label]));
        const inviteByApp = new Map((invites as any[]).map((iv) => [String(iv.applicationId), iv]));

        // Fill in names for records saved before `formName` existed (and for any
        // questionnaire renamed since it was assigned).
        const formIds = Array.from(new Set(responses.map((r: any) => String(r.onboardingFormId)).filter(Boolean)));
        const forms = formIds.length
            ? await OnboardingForm.find({ _id: { $in: formIds } }).select('name').lean()
            : [];
        const formNameById = new Map(forms.map((f: any) => [String(f._id), f.name]));

        const responsesByAppId = new Map<string, any[]>();
        for (const r of responses as any[]) {
            const key = String(r.applicationId);
            if (!responsesByAppId.has(key)) responsesByAppId.set(key, []);
            responsesByAppId.get(key)!.push(r);
        }

        let rows = applications.map((app: any) => {
            const packet = responsesByAppId.get(String(app._id)) || [];
            const progress = rollUpOnboarding(packet);
            const iv = inviteByApp.get(String(app._id));
            // What the admin explicitly requested the applicant to self-serve.
            const invite = iv ? {
                status: iv.status,
                expiresAt: iv.expiresAt || null,
                updatedAt: iv.updatedAt,
                requestedQuestionnaires: packet
                    .filter((r: any) => r.assignee === 'applicant')
                    .map((r: any) => formNameById.get(String(r.onboardingFormId)) || r.formName || 'Questionnaire'),
                requestedDocuments: (iv.requestedDocumentKeys || []).map((k: string) => ({
                    key: k,
                    label: reqLabelByKey.get(k) || k,
                })),
            } : null;
            return {
                _id: app._id,
                applicantName: app.applicantName,
                applicantEmail: app.applicantEmail,
                jobId: app.jobId,
                jobTitle: jobTitleById.get(String(app.jobId)) || 'Unknown Position',
                acceptedAt: app.updatedAt,
                onboarding: packet.map((r: any) => ({
                    _id: r._id,
                    onboardingFormId: r.onboardingFormId,
                    formName: formNameById.get(String(r.onboardingFormId)) || r.formName || 'Questionnaire',
                    status: r.status,
                    assignee: r.assignee || 'admin',
                    answeredCount: r.answeredCount || 0,
                    totalCount: r.totalCount || 0,
                    requiredCount: r.requiredCount || 0,
                    completedAt: r.completedAt || null,
                    updatedAt: r.updatedAt,
                })),
                invite,
                progress,
                onboardingStatus: progress.status,
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

// Assign one or more questionnaires to an accepted application. Accepts either
// `onboardingFormIds: string[]` or the original singular `onboardingFormId`.
// Questionnaires already assigned to this candidate are skipped, not rejected,
// so adding a second questionnaire to an in-flight packet is a plain re-POST.
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
        const requestedIds: string[] = Array.isArray(body?.onboardingFormIds)
            ? body.onboardingFormIds.map((v: any) => String(v || '')).filter(Boolean)
            : [(body?.onboardingFormId || '').toString()].filter(Boolean);
        const formIds = Array.from(new Set(requestedIds));

        if (!applicationId || formIds.length === 0) {
            return NextResponse.json({ error: 'applicationId and at least one onboardingFormId are required' }, { status: 400 });
        }

        const application = await JobApplication.findById(applicationId);
        if (!application) {
            return NextResponse.json({ error: 'Application not found' }, { status: 404 });
        }
        if (application.status !== 'accepted') {
            return NextResponse.json({ error: 'Onboarding can only be started for accepted applications.' }, { status: 400 });
        }

        const forms = await OnboardingForm.find({ _id: { $in: formIds } }).select('_id name customFields').lean();
        if (forms.length !== formIds.length) {
            return NextResponse.json({ error: 'One or more onboarding questionnaires were not found' }, { status: 404 });
        }

        const existing = await OnboardingResponse.find({ applicationId }).select('onboardingFormId order').lean();
        const assignedIds = new Set(existing.map((r: any) => String(r.onboardingFormId)));
        const toCreate = (forms as any[]).filter((f) => !assignedIds.has(String(f._id)));

        if (toCreate.length === 0) {
            return NextResponse.json(
                { error: 'Those questionnaires are already assigned to this candidate.' },
                { status: 409 }
            );
        }

        // Append to the end of the existing packet, preserving the order the
        // admin picked them in.
        let nextOrder = existing.reduce((max: number, r: any) => Math.max(max, r.order || 0), -1) + 1;

        // Person-centric owner (EmployeeRecord, Phase 1 dual-write); backfilled by 012.
        const employeeRecordId = await resolveEmployeeRecordIdByEmail(application.applicantEmail, {
            name: application.applicantName,
            applicationId: application._id,
        });

        const created = await OnboardingResponse.insertMany(
            toCreate.map((form: any) => {
                const fields = Array.isArray(form.customFields) ? form.customFields : [];
                return {
                    applicationId,
                    employeeRecordId,
                    onboardingFormId: form._id,
                    formName: form.name || '',
                    order: nextOrder++,
                    jobId: application.jobId,
                    applicantName: application.applicantName,
                    applicantEmail: application.applicantEmail,
                    status: 'in_progress',
                    answeredCount: 0,
                    totalCount: fields.length,
                    requiredCount: fields.filter((f: any) => f?.required).length,
                    startedByEmail: session.user?.email || '',
                };
            })
        );

        const skipped = forms.length - toCreate.length;
        return NextResponse.json(
            {
                message: `${created.length} questionnaire${created.length === 1 ? '' : 's'} assigned${skipped ? `, ${skipped} already assigned` : ''}`,
                data: created,
                skipped,
            },
            { status: 201 }
        );
    } catch (error: any) {
        // A surviving legacy `applicationId_1` unique index surfaces here as
        // E11000 when a candidate is given a second questionnaire.
        if (error?.code === 11000) {
            console.error('POST /api/admin/onboarding duplicate key — is the legacy applicationId_1 unique index still present? Run migrations/010-onboarding-multi-questionnaire.js', error?.keyPattern || error?.message);
            return NextResponse.json(
                { error: 'This candidate already has that questionnaire, or the database still enforces one questionnaire per candidate (migration 010 pending).' },
                { status: 409 }
            );
        }
        console.error('POST /api/admin/onboarding error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
