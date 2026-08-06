import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import EmployeeRecord from '@/models/EmployeeRecord';
import OnboardingInvite from '@/models/OnboardingInvite';
import OnboardingResponse from '@/models/OnboardingResponse';
import { sendOnboardingInviteEmail } from '@/lib/mailer';
import { buildOnboardingUrlForRecord, ONBOARDING_INVITE_TTL_MS } from '@/lib/onboardingInvite';

export const dynamic = 'force-dynamic';

async function isAdmin() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return false;
    const role = (session.user as any).role;
    return role === 'admin' || role === 'superadmin';
}

// Revoke / regenerate / cancel a STAFF onboarding invite (keyed on the
// EmployeeRecord). Record-based twin of the applicant invite management route.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ recordId: string }> }) {
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        await dbConnect();
        const { recordId } = await params;
        const body = await request.json();
        const action = String(body?.action || '');

        const invite = await OnboardingInvite.findOne({ employeeRecordId: recordId });
        if (!invite) {
            return NextResponse.json({ error: 'No onboarding request found for this staff member' }, { status: 404 });
        }

        if (action === 'revoke') {
            invite.status = 'revoked';
            await invite.save();
            return NextResponse.json({ message: 'Onboarding link revoked', invite });
        }

        if (action === 'cancel') {
            // Delete applicant questionnaires never touched (they only existed for
            // the request); keep+revert any with real answers. Nothing submitted is lost.
            const applicantResponses = await OnboardingResponse.find({ employeeRecordId: recordId, assignee: 'applicant' })
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

            const record = await EmployeeRecord.findById(recordId).select('email name').lean();
            const email = (record as any)?.email || invite.applicantEmail;
            const name = (record as any)?.name || invite.applicantName;
            if (!email) {
                return NextResponse.json({ error: 'This staff member has no email on file to send the link.' }, { status: 400 });
            }
            const onboardingUrl = buildOnboardingUrlForRecord(String(recordId), email);
            if (!onboardingUrl) {
                return NextResponse.json({ error: 'Cannot generate a secure link — no signing secret configured.' }, { status: 500 });
            }
            try {
                await sendOnboardingInviteEmail(email, name, onboardingUrl, invite.expiresAt);
            } catch (mailErr: any) {
                console.error('[Staff Onboarding Invite] Failed to re-send invite email:', mailErr?.message || mailErr);
            }
            return NextResponse.json({ message: 'Onboarding link regenerated', invite, onboardingUrl });
        }

        return NextResponse.json({ error: 'Invalid action. Use "revoke", "regenerate", or "cancel".' }, { status: 400 });
    } catch (error: any) {
        console.error('PATCH /api/admin/onboarding/staff-invite/[recordId] error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
