import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import Staff from '@/models/Staff';
import JobApplication from '@/models/JobApplication';
import OnboardingResponse from '@/models/OnboardingResponse';

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

        const onboarding = await OnboardingResponse.findOne({ applicationId: (application as any)._id })
            .select('_id status completedAt')
            .lean();

        return NextResponse.json({
            status: onboarding ? (onboarding as any).status : 'not_started',
            onboardingId: onboarding ? String((onboarding as any)._id) : null,
            completedAt: onboarding ? (onboarding as any).completedAt || null : null,
            applicationId: String((application as any)._id),
        });
    } catch (error: any) {
        console.error(`GET /api/admin/staff/${idStr || 'unknown'}/onboarding error:`, error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
