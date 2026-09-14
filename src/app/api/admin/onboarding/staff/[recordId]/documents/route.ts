import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import ApplicationDocument from '@/models/ApplicationDocument';

export const dynamic = 'force-dynamic';

async function isAdmin() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return false;
    const role = (session.user as any).role;
    return role === 'admin' || role === 'superadmin';
}

// Documents a staff member submitted during onboarding, keyed by their
// EmployeeRecord. Mirrors /api/applications/[id]/documents so the shared
// CandidateOnboardingDetail view can render the staff Documents section.
export async function GET(_request: Request, { params }: { params: Promise<{ recordId: string }> }) {
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        await dbConnect();
        const { recordId } = await params;
        const documents = await ApplicationDocument.find({ employeeRecordId: recordId })
            .select('documentType deliveryMethod fileName fileUrl value expiryDate status uploadedAt rejectionReason')
            .sort({ uploadedAt: -1 });
        return NextResponse.json({ success: true, documents });
    } catch (error: any) {
        console.error('GET /api/admin/onboarding/staff/[recordId]/documents error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
