import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getRetentionOverview } from '@/lib/documentHelpers';

export const dynamic = 'force-dynamic';

async function isAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return false;
  const role = session.user.role;
  return role === 'admin' || role === 'superadmin';
}

/**
 * GET /api/admin/compliance/retention
 * Read-only view of every archived (terminated) staff member's compliance data
 * and its retention state (held / pending / due / protected).
 */
export async function GET() {
  try {
    if (!(await isAdmin())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const overview = await getRetentionOverview();
    console.log('[Compliance Retention] served', {
      archivedStaff: overview.summary.archivedStaff,
      due: overview.summary.due,
      pending: overview.summary.pending,
      held: overview.summary.held,
    });
    return NextResponse.json({ success: true, ...overview });
  } catch (err: any) {
    console.error('[Compliance Retention] Error:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Failed to load retention state' }, { status: 500 });
  }
}
