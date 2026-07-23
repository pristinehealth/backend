import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import Staff from '@/models/Staff';
import JobApplication from '@/models/JobApplication';
import OnboardingResponse from '@/models/OnboardingResponse';
import { rollUpOnboarding } from '@/lib/onboardingProgress';

export const dynamic = 'force-dynamic';

async function isAdmin() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return false;
    const role = (session.user as any).role;
    return role === 'admin' || role === 'superadmin';
}

// Onboarding status for a staff member. Resolves the staff → their accepted
// application (by the stamped acceptedStaffId, falling back to email) → the
// onboarding record. Returns 'no_application' when the staff has no accepted
// application, 'not_started' when there's no onboarding record yet.
export async function GET(request: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
    let idStr = '';
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        await dbConnect();
        const { staffId } = await params;
        idStr = staffId;

        const staff = await Staff.findOne({ staffid: staffId }).select('email').lean();
        const email = (staff as any)?.email as string | undefined;

        const or: any[] = [{ acceptedStaffId: staffId }];
        if (email) {
            const rx = new RegExp(`^${email.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
            or.push({ applicantEmail: rx });
        }

        const application = await JobApplication.findOne({ status: 'accepted', $or: or })
            .sort({ updatedAt: -1 })
            .select('_id')
            .lean();

        if (!application) {
            return NextResponse.json({ status: 'no_application' });
        }

        // A candidate can hold several questionnaires, so the badge reflects the
        // whole packet: complete only once every assigned one is complete.
        const packet = await OnboardingResponse.find({ applicationId: (application as any)._id })
            .select('_id onboardingFormId formName order status answeredCount totalCount completedAt')
            .sort({ order: 1, createdAt: 1 })
            .lean();

        const progress = rollUpOnboarding(packet as any[]);
        const lastCompletedAt = (packet as any[])
            .map((r) => r.completedAt)
            .filter(Boolean)
            .sort((a: Date, b: Date) => new Date(b).getTime() - new Date(a).getTime())[0] || null;

        return NextResponse.json({
            status: progress.status,
            progress,
            questionnaires: (packet as any[]).map((r) => ({
                _id: String(r._id),
                formName: r.formName || 'Questionnaire',
                status: r.status,
                answeredCount: r.answeredCount || 0,
                totalCount: r.totalCount || 0,
                completedAt: r.completedAt || null,
            })),
            // Kept for existing callers: the first questionnaire in the packet.
            onboardingId: packet.length ? String((packet[0] as any)._id) : null,
            completedAt: progress.status === 'completed' ? lastCompletedAt : null,
            applicationId: String((application as any)._id),
        });
    } catch (error: any) {
        console.error(`GET /api/admin/staff/${idStr || 'unknown'}/onboarding error:`, error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
