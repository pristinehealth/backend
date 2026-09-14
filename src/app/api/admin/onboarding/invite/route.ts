import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import JobApplication from '@/models/JobApplication';
import OnboardingForm from '@/models/OnboardingForm';
import OnboardingResponse from '@/models/OnboardingResponse';
import OnboardingInvite from '@/models/OnboardingInvite';
import { getComplianceRequirements } from '@/lib/compliance';
import { sendOnboardingInviteEmail } from '@/lib/mailer';
import { buildOnboardingUrl, ONBOARDING_INVITE_TTL_MS } from '@/lib/onboardingInvite';
import { resolveEmployeeRecordIdByEmail } from '@/lib/employeeRecord';

export const dynamic = 'force-dynamic';

async function isAdmin() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return false;
    const role = (session.user as any).role;
    return role === 'admin' || role === 'superadmin';
}

// Send (or re-send) an onboarding/compliance request to an accepted applicant:
// mark the chosen questionnaires as applicant-fillable, record the requested
// compliance document keys, mint an expiring link, and email it.
export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!(await isAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const body = await request.json();
        const applicationId = (body?.applicationId || '').toString();
        const onboardingFormIds: string[] = Array.from(new Set(
            (Array.isArray(body?.onboardingFormIds) ? body.onboardingFormIds : [])
                .map((v: any) => String(v || '')).filter(Boolean)
        ));
        const requestedKeysInput: string[] = Array.from(new Set(
            (Array.isArray(body?.requestedDocumentKeys) ? body.requestedDocumentKeys : [])
                .map((v: any) => String(v || '')).filter(Boolean)
        ));

        if (!applicationId) {
            return NextResponse.json({ error: 'applicationId is required' }, { status: 400 });
        }
        if (onboardingFormIds.length === 0 && requestedKeysInput.length === 0) {
            return NextResponse.json({ error: 'Select at least one questionnaire or document to request.' }, { status: 400 });
        }

        const application = await JobApplication.findById(applicationId);
        if (!application) {
            return NextResponse.json({ error: 'Application not found' }, { status: 404 });
        }
        if (application.status !== 'accepted') {
            return NextResponse.json({ error: 'Onboarding can only be requested for accepted applications.' }, { status: 400 });
        }

        // Person-centric owner (EmployeeRecord, Phase 1 dual-write) stamped on the
        // onboarding responses + invite created below. Best-effort; backfilled by 012.
        const employeeRecordId = await resolveEmployeeRecordIdByEmail(application.applicantEmail, {
            name: application.applicantName,
            applicationId: application._id,
        });

        // The checked questionnaires are AUTHORITATIVE: mark them applicant-fill,
        // and revert any previously-requested one that was unchecked back to
        // admin-fill (so it stays in the packet but leaves the applicant's view).
        {
            const forms = onboardingFormIds.length
                ? await OnboardingForm.find({ _id: { $in: onboardingFormIds } }).select('_id name customFields').lean()
                : [];
            if (forms.length !== onboardingFormIds.length) {
                return NextResponse.json({ error: 'One or more onboarding questionnaires were not found' }, { status: 404 });
            }

            const existing = await OnboardingResponse.find({ applicationId })
                .select('onboardingFormId order assignee answeredCount status').lean();
            const existingByForm = new Map(existing.map((r: any) => [String(r.onboardingFormId), r]));
            const targetSet = new Set(onboardingFormIds);
            let nextOrder = existing.reduce((max: number, r: any) => Math.max(max, r.order || 0), -1) + 1;

            // Add / keep requested ones as applicant-fill.
            for (const form of forms as any[]) {
                const fields = Array.isArray(form.customFields) ? form.customFields : [];
                const key = String(form._id);
                if (existingByForm.has(key)) {
                    await OnboardingResponse.updateOne(
                        { applicationId, onboardingFormId: form._id },
                        { $set: { assignee: 'applicant' } }
                    );
                } else {
                    await OnboardingResponse.create({
                        applicationId,
                        employeeRecordId,
                        onboardingFormId: form._id,
                        assignee: 'applicant',
                        formName: form.name || '',
                        order: nextOrder++,
                        jobId: application.jobId,
                        applicantName: application.applicantName,
                        applicantEmail: application.applicantEmail,
                        status: 'in_progress',
                        answeredCount: 0,
                        totalCount: fields.length,
                        requiredCount: fields.filter((f: any) => f?.required).length,
                        startedByEmail: session?.user?.email || '',
                    });
                }
            }

            // Un-request the unchecked ones: delete empties (they only existed for
            // the request), keep+revert-to-admin any with real answers.
            for (const r of existing as any[]) {
                if (r.assignee === 'applicant' && !targetSet.has(String(r.onboardingFormId))) {
                    const empty = (r.answeredCount || 0) === 0 && r.status !== 'completed';
                    if (empty) {
                        await OnboardingResponse.deleteOne({ _id: r._id });
                    } else {
                        await OnboardingResponse.updateOne({ _id: r._id }, { $set: { assignee: 'admin' } });
                    }
                }
            }
        }

        // Keep only requested keys that are real, active requirements.
        const activeReqs = await getComplianceRequirements();
        const activeKeys = new Set(activeReqs.map((r) => r.key));
        const requestedDocumentKeys = requestedKeysInput.filter((k) => activeKeys.has(k));

        const expiresAt = new Date(Date.now() + ONBOARDING_INVITE_TTL_MS);
        const invite = await OnboardingInvite.findOneAndUpdate(
            { applicationId },
            {
                $set: {
                    employeeRecordId,
                    applicantEmail: application.applicantEmail,
                    applicantName: application.applicantName,
                    jobId: application.jobId,
                    onboardingFormIds,
                    requestedDocumentKeys,
                    expiresAt,
                    status: 'active',
                    createdByEmail: session?.user?.email || '',
                },
            },
            { upsert: true, new: true }
        );

        const onboardingUrl = buildOnboardingUrl(applicationId, application.applicantEmail);
        if (!onboardingUrl) {
            return NextResponse.json(
                { error: 'Cannot generate a secure link — no signing secret configured (APPLICATION_LINK_SECRET / NEXTAUTH_SECRET).' },
                { status: 500 }
            );
        }

        try {
            await sendOnboardingInviteEmail(application.applicantEmail, application.applicantName, onboardingUrl, expiresAt);
        } catch (mailErr: any) {
            console.error('[Onboarding Invite] Failed to send invite email:', mailErr?.message || mailErr);
            // The invite + link are valid even if the email failed; admin can copy the link.
        }

        return NextResponse.json({ message: 'Onboarding request sent', invite, onboardingUrl }, { status: 201 });
    } catch (error: any) {
        console.error('POST /api/admin/onboarding/invite error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
