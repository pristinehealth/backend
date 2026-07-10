import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import Staff from '@/models/Staff';
import { computeStaffComplianceSummaries } from '@/lib/compliance';

export const dynamic = 'force-dynamic';

async function isAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return false;
  const role = session.user.role;
  return role === 'admin' || role === 'superadmin';
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * GET /api/admin/compliance/staff?search=&page=&limit=
 * Paginated list of staff with a compliance summary each (for the compliance
 * dashboard table). Summaries for the whole page are computed in a fixed handful
 * of bulk queries (computeStaffComplianceSummaries), not one query per staff.
 */
export async function GET(request: Request) {
  try {
    if (!(await isAdmin())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await dbConnect();

    const url = new URL(request.url);
    const search = (url.searchParams.get('search') || '').trim();
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10) || 20));

    const filter: any = {};
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      filter.$or = [
        { firstname: rx },
        { lastname: rx },
        { full_name: rx },
        { email: rx },
        { staffid: rx },
      ];
    }

    // Sort "issues first" at the DB level using the denormalized, indexed
    // complianceSeverity (kept fresh by refreshStaffComplianceStatus), then
    // paginate — so only the visible page has its summary computed for display.
    const total = await Staff.countDocuments(filter);
    const staff = await Staff.find(filter)
      .select('staffid email firstname lastname full_name role positionId positionTitle')
      .sort({ complianceSeverity: -1, complianceProblemCount: -1, firstname: 1, lastname: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const summaries = await computeStaffComplianceSummaries(
      (staff as any[]).map((s) => ({
        staffid: String(s.staffid),
        email: s.email || null,
        role: s.role || null,
        positionId: s.positionId || null,
      }))
    );

    const emptySummary = { total: 0, verified: 0, pending: 0, expired: 0, rejected: 0, missing: 0, mandatoryMissing: 0 };
    const rows = (staff as any[]).map((s) => {
      const view = summaries.get(String(s.staffid));
      return {
        staffId: String(s.staffid),
        name: s.full_name || `${s.firstname || ''} ${s.lastname || ''}`.trim() || String(s.staffid),
        email: s.email || '',
        role: s.role || '',
        summary: view?.summary ?? emptySummary,
      };
    });

    console.log('[Compliance Staff List] page', {
      search: search || null,
      page,
      limit,
      returned: rows.length,
      total,
    });
    return NextResponse.json({
      success: true,
      staff: rows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err: any) {
    console.error('[Compliance Staff List] Error:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Failed to load staff compliance' }, { status: 500 });
  }
}
