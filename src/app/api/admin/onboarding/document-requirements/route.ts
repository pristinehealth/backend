import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import JobApplication from '@/models/JobApplication';
import Staff from '@/models/Staff';
import OnboardingInvite from '@/models/OnboardingInvite';
import { getComplianceRequirements } from '@/lib/compliance';
import { resolveEmployeeRecordIdByEmail, resolveEmployeeRecordByStaff } from '@/lib/employeeRecord';
import { ONBOARDING_INVITE_TTL_MS } from '@/lib/onboardingInvite';

export const dynamic = 'force-dynamic';

async function isAdmin() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return false;
    const role = (session.user as any).role;
    return role === 'admin' || role === 'superadmin';
}

// Register document requirements on a person's onboarding WITHOUT sending a link —
// so an admin can add "expected documents" and then upload them on the person's
// behalf (or send the link later via Request). Works for a candidate
// (applicationId) or a staff member (staffId). Merges into the invite's
// requestedDocumentKeys; no email is sent.
export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!(await isAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        await dbConnect();
        const body = await request.json();
        const applicationId = (body?.applicationId || '').toString();
        const staffId = (body?.staffId || '').toString();
        const keysInput: string[] = Array.from(new Set(
            (Array.isArray(body?.documentKeys) ? body.documentKeys : []).map((v: any) => String(v || '')).filter(Boolean)
        ));

        if ((!applicationId && !staffId) || keysInput.length === 0) {
            return NextResponse.json({ error: 'applicationId or staffId, and at least one documentKey, are required' }, { status: 400 });
        }

        // Keep only real, active requirement keys.
        const activeReqs = await getComplianceRequirements();
        const activeKeys = new Set(activeReqs.map((r) => r.key));
        const documentKeys = keysInput.filter((k) => activeKeys.has(k));
        if (documentKeys.length === 0) {
            return NextResponse.json({ error: 'None of the selected documents are active requirements.' }, { status: 400 });
        }

        let subjectFilter: Record<string, any>;
        let onInsert: Record<string, any>;
        if (applicationId) {
            const app = await JobApplication.findById(applicationId).select('applicantEmail applicantName jobId').lean();
            if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
            const empId = await resolveEmployeeRecordIdByEmail((app as any).applicantEmail, { name: (app as any).applicantName, applicationId });
            subjectFilter = { applicationId };
            onInsert = { applicationId, employeeRecordId: empId, applicantEmail: (app as any).applicantEmail, applicantName: (app as any).applicantName, jobId: (app as any).jobId || null };
        } else {
            const staff = await Staff.findOne({ staffid: staffId }).select('staffid email full_name firstname lastname').lean();
            if (!staff) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
            const name = (staff as any).full_name || [(staff as any).firstname, (staff as any).lastname].filter(Boolean).join(' ').trim();
            const rec = await resolveEmployeeRecordByStaff(staffId, { email: (staff as any).email, name });
            if (!rec) return NextResponse.json({ error: 'Could not resolve a staff record.' }, { status: 500 });
            subjectFilter = { employeeRecordId: rec._id };
            onInsert = { employeeRecordId: rec._id, applicantEmail: rec.email || '', applicantName: rec.name || name || '' };
        }

        const invite = await OnboardingInvite.findOneAndUpdate(
            subjectFilter,
            {
                $addToSet: { requestedDocumentKeys: { $each: documentKeys } },
                $setOnInsert: {
                    ...onInsert,
                    expiresAt: new Date(Date.now() + ONBOARDING_INVITE_TTL_MS),
                    status: 'active',
                    createdByEmail: session?.user?.email || '',
                },
            },
            { upsert: true, new: true }
        );

        return NextResponse.json({ message: 'Documents added to onboarding', invite }, { status: 200 });
    } catch (error: any) {
        console.error('POST /api/admin/onboarding/document-requirements error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
