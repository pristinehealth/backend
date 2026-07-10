import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getComplianceSummary } from '@/lib/compliance';

export const dynamic = 'force-dynamic';

async function isAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return false;
  const role = session.user.role;
  return role === 'admin' || role === 'superadmin';
}

/**
 * GET /api/admin/compliance/summary
 * Org-wide compliance posture for the dashboard overview.
 */
export async function GET() {
  try {
    if (!(await isAdmin())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const summary = await getComplianceSummary();
    console.log('[Compliance Summary] served', {
      totalStaff: summary.totalStaff,
      attention: summary.attention,
      inProgress: summary.inProgress,
      compliant: summary.compliant,
      mandatoryMissing: summary.mandatoryMissing,
    });
    return NextResponse.json({ success: true, ...summary });
  } catch (err: any) {
    console.error('[Compliance Summary] Error:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Failed to load compliance summary' }, { status: 500 });
  }
}
