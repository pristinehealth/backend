import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { disposeExpiredComplianceData } from '@/lib/documentHelpers';

export const dynamic = 'force-dynamic';

async function isAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return false;
  const role = session.user.role;
  return role === 'admin' || role === 'superadmin';
}

/**
 * POST /api/admin/compliance/dispose   body: { dryRun?: boolean }
 *
 * Securely disposes compliance data whose retention window has elapsed
 * (archived staff + requirement.retentionDays set + window passed + staff no
 * longer active). DRY-RUN by default — pass `{ "dryRun": false }` to actually
 * delete records/evidence and their Cloudinary files.
 *
 * GET returns the same preview (always dry-run).
 */
export async function POST(request: Request) {
  try {
    if (!(await isAdmin())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const dryRun = body?.dryRun !== false; // default true; must explicitly pass false
    const staffId = typeof body?.staffId === 'string' && body.staffId ? body.staffId : undefined;
    console.log('[Compliance Dispose] start', { dryRun, staffId: staffId || 'ALL' });
    const result = await disposeExpiredComplianceData({ dryRun, staffId });
    console.log('[Compliance Dispose]', dryRun ? 'preview' : 'DISPOSED', {
      staffId: staffId || 'ALL',
      records: result.recordsDisposed,
      files: result.filesDeleted,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[Compliance Dispose] Error:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Disposal failed' }, { status: 500 });
  }
}

export async function GET() {
  try {
    if (!(await isAdmin())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const result = await disposeExpiredComplianceData({ dryRun: true });
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[Compliance Dispose GET] Error:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Disposal preview failed' }, { status: 500 });
  }
}
