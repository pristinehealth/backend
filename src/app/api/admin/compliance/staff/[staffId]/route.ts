import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import dbConnect from '@/lib/mongoose';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import Staff from '@/models/Staff';
import { buildComplianceView } from '@/lib/compliance';

/**
 * GET /api/admin/compliance/staff/[staffId]
 *
 * Returns the compliance posture for a single staff member: one card per active
 * compliance requirement with its status, evidence, and expiry. Reads purely
 * from the authoritative compliance domain (StaffComplianceRecord).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ staffId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.role || !['admin', 'superadmin'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    const { staffId } = await params;

    const staff = await Staff.findOne({ staffid: staffId })
      .select('staffid email role positionId')
      .lean();
    if (!staff) {
      console.warn('[Compliance Staff GET] Staff not found', { staffId });
      return NextResponse.json({ error: `Staff ${staffId} not found` }, { status: 404 });
    }

    const view = await buildComplianceView({
      staffId: (staff as any).staffid,
      staffEmail: (staff as any).email || null,
      role: (staff as any).role || null,
      positionId: (staff as any).positionId || null,
    });

    console.log('[Compliance Staff GET] view', {
      staffId,
      cards: view.cards.length,
      summary: view.summary,
    });
    return NextResponse.json(
      {
        success: true,
        staffId: (staff as any).staffid,
        ...view,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('[Compliance Staff GET] Error:', err?.message || err);
    return NextResponse.json(
      { error: err?.message || 'Failed to load compliance status' },
      { status: 500 }
    );
  }
}
