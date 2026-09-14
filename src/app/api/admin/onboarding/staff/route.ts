import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import Staff from '@/models/Staff';
import EmployeeRecord from '@/models/EmployeeRecord';
import OnboardingForm from '@/models/OnboardingForm';
import OnboardingResponse from '@/models/OnboardingResponse';
import OnboardingInvite from '@/models/OnboardingInvite';
import { rollUpOnboarding } from '@/lib/onboardingProgress';
import { getComplianceRequirements } from '@/lib/compliance';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

async function isAdmin() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return false;
    const role = (session.user as any).role;
    return role === 'admin' || role === 'superadmin';
}

const staffName = (s: any) =>
    (s.full_name || [s.firstname, s.lastname].filter(Boolean).join(' ').trim() || s.staffid);

// Every staff member, each with their onboarding rolled up (or "not started").
// The Staff sub-tab mirrors the Candidates tab: it lists ALL staff so onboarding
// can be started/managed per-row, not just staff who already have an invite.
// Filters: ?onboardingStatus (not_started|in_progress|completed), ?q, ?page.
export async function GET(request: Request) {
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        await dbConnect();

        const { searchParams } = new URL(request.url);
        const onboardingStatus = searchParams.get('onboardingStatus') || '';
        const q = (searchParams.get('q') || '').trim();
        const staffId = (searchParams.get('staffId') || '').trim();
        const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

        // ?staffId= returns just that one staff member's onboarding (used by the
        // staff compliance detail to show onboarding progress in place).
        const staff = await Staff.find(staffId ? { staffid: staffId } : {})
            .select('staffid email firstname lastname full_name')
            .lean();

        // Resolve each staff member's EmployeeRecord (by staffId) and, through it,
        // their staff onboarding invite + responses.
        const staffIds = staff.map((s: any) => String(s.staffid)).filter(Boolean);
        const records = await EmployeeRecord.find({ staffId: { $in: staffIds } })
            .select('staffId email name').lean();
        const recordByStaffId = new Map((records as any[]).map((r) => [String(r.staffId), r]));
        const recordIds = (records as any[]).map((r) => r._id);

        const [invites, responses, complianceReqs] = await Promise.all([
            // ANY invite for the person (candidate-era or staff-era), most recent first —
            // so a hired candidate's onboarding request still shows under Staff.
            OnboardingInvite.find({ employeeRecordId: { $in: recordIds } })
                .select('employeeRecordId status expiresAt requestedDocumentKeys updatedAt').sort({ updatedAt: -1 }).lean(),
            OnboardingResponse.find({ employeeRecordId: { $in: recordIds } })
                .select('employeeRecordId onboardingFormId formName order status assignee answeredCount totalCount requiredCount completedAt createdAt updatedAt')
                .sort({ order: 1, createdAt: 1 }).lean(),
            getComplianceRequirements(),
        ]);
        // First per record = most recent invite.
        const inviteByRecord = new Map<string, any>();
        for (const iv of invites as any[]) { const k = String(iv.employeeRecordId); if (!inviteByRecord.has(k)) inviteByRecord.set(k, iv); }
        const reqLabelByKey = new Map((complianceReqs as any[]).map((r) => [r.key, r.label]));

        const formIds = Array.from(new Set(responses.map((r: any) => String(r.onboardingFormId)).filter(Boolean)));
        const forms = formIds.length
            ? await OnboardingForm.find({ _id: { $in: formIds } }).select('name').lean()
            : [];
        const formNameById = new Map((forms as any[]).map((f) => [String(f._id), f.name]));

        const responsesByRecord = new Map<string, any[]>();
        for (const r of responses as any[]) {
            const key = String(r.employeeRecordId);
            if (!responsesByRecord.has(key)) responsesByRecord.set(key, []);
            responsesByRecord.get(key)!.push(r);
        }

        let rows = staff.map((s: any) => {
            const rec = recordByStaffId.get(String(s.staffid));
            const recordId = rec ? String(rec._id) : null;
            const packet = recordId ? (responsesByRecord.get(recordId) || []) : [];
            const iv = recordId ? inviteByRecord.get(recordId) : null;
            const progress = rollUpOnboarding(packet);
            return {
                staffId: String(s.staffid),
                recordId,
                applicantName: rec?.name || staffName(s),
                applicantEmail: rec?.email || s.email || '',
                onboardingStatus: progress.status,
                progress,
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
                invite: iv ? {
                    status: iv.status,
                    expiresAt: iv.expiresAt || null,
                    updatedAt: iv.updatedAt,
                    requestedQuestionnaires: packet
                        .filter((r: any) => r.assignee === 'applicant')
                        .map((r: any) => formNameById.get(String(r.onboardingFormId)) || r.formName || 'Questionnaire'),
                    requestedDocuments: (iv.requestedDocumentKeys || []).map((k: string) => ({ key: k, label: reqLabelByKey.get(k) || k })),
                } : null,
            };
        });

        if (q) {
            const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            rows = rows.filter((r) => rx.test(r.applicantName) || rx.test(r.applicantEmail) || rx.test(String(r.staffId || '')));
        }
        if (onboardingStatus === 'not_started' || onboardingStatus === 'in_progress' || onboardingStatus === 'completed') {
            rows = rows.filter((r) => r.onboardingStatus === onboardingStatus);
        }

        // Onboarding-in-progress first, then by name, so active work surfaces.
        const rank: Record<string, number> = { in_progress: 0, completed: 1, not_started: 2 };
        rows.sort((a, b) => (rank[a.onboardingStatus] - rank[b.onboardingStatus]) || a.applicantName.localeCompare(b.applicantName));

        const total = rows.length;
        const start = (page - 1) * PAGE_SIZE;
        const data = rows.slice(start, start + PAGE_SIZE);

        return NextResponse.json({ data, total, page, pageSize: PAGE_SIZE });
    } catch (error: any) {
        console.error('GET /api/admin/onboarding/staff error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
