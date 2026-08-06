import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import Staff from '@/models/Staff';
import OnboardingForm from '@/models/OnboardingForm';
import OnboardingResponse from '@/models/OnboardingResponse';
import OnboardingInvite from '@/models/OnboardingInvite';
import { getComplianceRequirements } from '@/lib/compliance';
import { sendOnboardingInviteEmail } from '@/lib/mailer';
import { buildOnboardingUrlForRecord, ONBOARDING_INVITE_TTL_MS } from '@/lib/onboardingInvite';
import { resolveEmployeeRecordByStaff } from '@/lib/employeeRecord';

export const dynamic = 'force-dynamic';

async function isAdmin() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return false;
    const role = (session.user as any).role;
    return role === 'admin' || role === 'superadmin';
}

// Onboard an EXISTING STAFF member who has no application (Phase 3). Resolves the
// staff member's EmployeeRecord (creating/linking it), marks the chosen
// questionnaires applicant-fillable and records the requested compliance keys —
// all keyed on the record, not an application — then mints an expiring link.
export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!(await isAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const body = await request.json();
        const staffId = (body?.staffId || '').toString().trim();
        const emailInput = (body?.email || '').toString().trim();
        const onboardingFormIds: string[] = Array.from(new Set(
            (Array.isArray(body?.onboardingFormIds) ? body.onboardingFormIds : []).map((v: any) => String(v || '')).filter(Boolean)
        ));
        const requestedKeysInput: string[] = Array.from(new Set(
            (Array.isArray(body?.requestedDocumentKeys) ? body.requestedDocumentKeys : []).map((v: any) => String(v || '')).filter(Boolean)
        ));

        if (!staffId) {
            return NextResponse.json({ error: 'staffId is required' }, { status: 400 });
        }
        if (onboardingFormIds.length === 0 && requestedKeysInput.length === 0) {
            return NextResponse.json({ error: 'Select at least one questionnaire or document to request.' }, { status: 400 });
        }

        const staff = await Staff.findOne({ staffid: staffId }).select('staffid email full_name firstname lastname').lean();
        if (!staff) {
            return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
        }
        const staffName = (staff as any).full_name || [(staff as any).firstname, (staff as any).lastname].filter(Boolean).join(' ').trim();

        // Resolve/link the person's record; prefer an explicitly-provided email.
        const record = await resolveEmployeeRecordByStaff(staffId, {
            email: emailInput || (staff as any).email,
            name: staffName,
        });
        if (!record) {
            return NextResponse.json({ error: 'Could not resolve an employee record for this staff member.' }, { status: 500 });
        }
        if (!record.email) {
            // Access is email-based — without one we cannot mint a link.
            return NextResponse.json(
                { error: 'This staff member has no email on file. Provide an email to send the onboarding link.', needsEmail: true },
                { status: 400 }
            );
        }
        const employeeRecordId = record._id;
        const applicantEmail = record.email;
        const applicantName = record.name || staffName;

        // Reconcile questionnaires by (employeeRecordId, onboardingFormId).
        {
            const forms = onboardingFormIds.length
                ? await OnboardingForm.find({ _id: { $in: onboardingFormIds } }).select('_id name customFields').lean()
                : [];
            if (forms.length !== onboardingFormIds.length) {
                return NextResponse.json({ error: 'One or more onboarding questionnaires were not found' }, { status: 404 });
            }

            const existing = await OnboardingResponse.find({ employeeRecordId })
                .select('onboardingFormId order assignee answeredCount status').lean();
            const existingByForm = new Map(existing.map((r: any) => [String(r.onboardingFormId), r]));
            const targetSet = new Set(onboardingFormIds);
            let nextOrder = existing.reduce((max: number, r: any) => Math.max(max, r.order || 0), -1) + 1;

            for (const form of forms as any[]) {
                const fields = Array.isArray(form.customFields) ? form.customFields : [];
                const key = String(form._id);
                if (existingByForm.has(key)) {
                    await OnboardingResponse.updateOne(
                        { employeeRecordId, onboardingFormId: form._id },
                        { $set: { assignee: 'applicant' } }
                    );
                } else {
                    await OnboardingResponse.create({
                        employeeRecordId,
                        applicationId: null,
                        onboardingFormId: form._id,
                        assignee: 'applicant',
                        formName: form.name || '',
                        order: nextOrder++,
                        jobId: null,
                        applicantName,
                        applicantEmail,
                        status: 'in_progress',
                        answeredCount: 0,
                        totalCount: fields.length,
                        requiredCount: fields.filter((f: any) => f?.required).length,
                        startedByEmail: session?.user?.email || '',
                    });
                }
            }

            // Un-request the unchecked applicant-fill ones: delete empties, keep+revert others.
            for (const r of existing as any[]) {
                if (r.assignee === 'applicant' && !targetSet.has(String(r.onboardingFormId))) {
                    const empty = (r.answeredCount || 0) === 0 && r.status !== 'completed';
                    if (empty) await OnboardingResponse.deleteOne({ _id: r._id });
                    else await OnboardingResponse.updateOne({ _id: r._id }, { $set: { assignee: 'admin' } });
                }
            }
        }

        // Keep only requested keys that are real, active requirements.
        const activeReqs = await getComplianceRequirements();
        const activeKeys = new Set(activeReqs.map((r) => r.key));
        const requestedDocumentKeys = requestedKeysInput.filter((k) => activeKeys.has(k));

        const expiresAt = new Date(Date.now() + ONBOARDING_INVITE_TTL_MS);
        // One invite per person: upsert on employeeRecordId. applicationId is left
        // as-is (null for a pure staff invite; preserved if this person also had one).
        const invite = await OnboardingInvite.findOneAndUpdate(
            { employeeRecordId },
            {
                $set: {
                    employeeRecordId,
                    applicantEmail,
                    applicantName,
                    onboardingFormIds,
                    requestedDocumentKeys,
                    expiresAt,
                    status: 'active',
                    createdByEmail: session?.user?.email || '',
                },
            },
            { upsert: true, new: true }
        );

        const onboardingUrl = buildOnboardingUrlForRecord(String(employeeRecordId), applicantEmail);
        if (!onboardingUrl) {
            return NextResponse.json(
                { error: 'Cannot generate a secure link — no signing secret configured (APPLICATION_LINK_SECRET / NEXTAUTH_SECRET).' },
                { status: 500 }
            );
        }

        try {
            await sendOnboardingInviteEmail(applicantEmail, applicantName, onboardingUrl, expiresAt);
        } catch (mailErr: any) {
            console.error('[Staff Onboarding Invite] Failed to send invite email:', mailErr?.message || mailErr);
        }

        return NextResponse.json(
            { message: 'Onboarding request sent', invite, onboardingUrl, employeeRecordId: String(employeeRecordId) },
            { status: 201 }
        );
    } catch (error: any) {
        console.error('POST /api/admin/onboarding/staff-invite error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
