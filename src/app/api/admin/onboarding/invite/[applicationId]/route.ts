import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import JobApplication from '@/models/JobApplication';
import OnboardingInvite from '@/models/OnboardingInvite';
import OnboardingResponse from '@/models/OnboardingResponse';
import { sendOnboardingInviteEmail } from '@/lib/mailer';
import { buildOnboardingUrl, ONBOARDING_INVITE_TTL_MS } from '@/lib/onboardingInvite';

export const dynamic = 'force-dynamic';

async function isAdmin() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return false;
    const role = (session.user as any).role;
    return role === 'admin' || role === 'superadmin';
}

// Current invite state for a candidate (for the admin request modal).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ applicationId: string }> }) {
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        await dbConnect();
        const { applicationId } = await params;
        const invite = await OnboardingInvite.findOne({ applicationId }).lean();
        return NextResponse.json({ invite: invite || null });
    } catch (error: any) {
        console.error('GET /api/admin/onboarding/invite/[applicationId] error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}

// Revoke or regenerate an applicant's onboarding link.
//   { action: 'revoke' }      → status 'revoked' (the link stops working)
//   { action: 'regenerate' }  → fresh expiry + status 'active', re-send email
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ applicationId: string }> }) {
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        await dbConnect();
        const { applicationId } = await params;
        const body = await request.json();
        const action = String(body?.action || '');

        const invite = await OnboardingInvite.findOne({ applicationId });
        if (!invite) {
            return NextResponse.json({ error: 'No onboarding request found for this application' }, { status: 404 });
        }

        if (action === 'revoke') {
            invite.status = 'revoked';
            await invite.save();
            return NextResponse.json({ message: 'Onboarding link revoked', invite });
        }

        // Full undo: disable the link AND clear everything requested. Applicant
        // questionnaires the applicant NEVER touched (empty, not completed) only
        // existed because of the request — delete them so they don't linger as
        // phantom in-progress items dragging the candidate's rolled-up status.
        // Ones with real answers are preserved (reverted to admin-fill). Nothing
        // already submitted is discarded.
        if (action === 'cancel') {
            const applicantResponses = await OnboardingResponse.find({ applicationId, assignee: 'applicant' })
                .select('_id answeredCount status').lean();
            const emptyIds = applicantResponses.filter((r: any) => (r.answeredCount || 0) === 0 && r.status !== 'completed').map((r: any) => r._id);
            const keepIds = applicantResponses.filter((r: any) => !((r.answeredCount || 0) === 0 && r.status !== 'completed')).map((r: any) => r._id);
            if (emptyIds.length) await OnboardingResponse.deleteMany({ _id: { $in: emptyIds } });
            if (keepIds.length) await OnboardingResponse.updateMany({ _id: { $in: keepIds } }, { $set: { assignee: 'admin' } });
            invite.status = 'revoked';
            invite.onboardingFormIds = [];
            invite.requestedDocumentKeys = [];
            await invite.save();
            return NextResponse.json({ message: 'Onboarding request cancelled', invite });
        }

        if (action === 'regenerate') {
            invite.expiresAt = new Date(Date.now() + ONBOARDING_INVITE_TTL_MS);
            invite.status = 'active';
            await invite.save();

            const application = await JobApplication.findById(applicationId).select('applicantEmail applicantName').lean();
            const email = (application as any)?.applicantEmail || invite.applicantEmail;
            const name = (application as any)?.applicantName || invite.applicantName;
            const onboardingUrl = buildOnboardingUrl(applicationId, email);
            if (!onboardingUrl) {
                return NextResponse.json(
                    { error: 'Cannot generate a secure link — no signing secret configured.' },
                    { status: 500 }
                );
            }
            try {
                await sendOnboardingInviteEmail(email, name, onboardingUrl, invite.expiresAt);
            } catch (mailErr: any) {
                console.error('[Onboarding Invite] Failed to re-send invite email:', mailErr?.message || mailErr);
            }
            return NextResponse.json({ message: 'Onboarding link regenerated', invite, onboardingUrl });
        }

        return NextResponse.json({ error: 'Invalid action. Use "revoke", "regenerate", or "cancel".' }, { status: 400 });
    } catch (error: any) {
        console.error('PATCH /api/admin/onboarding/invite/[applicationId] error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
