import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import ComplianceRequirement, {
  type ComplianceEvidenceMode,
} from '@/models/ComplianceRequirement';
import { ensureRequirementsSeeded, getRequirementUsageCounts, refreshStaffComplianceStatus } from '@/lib/compliance';

export const dynamic = 'force-dynamic';

async function isAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return false;
  const role = session.user.role;
  return role === 'admin' || role === 'superadmin';
}

const EVIDENCE_MODES: ComplianceEvidenceMode[] = ['file', 'metadata_only', 'either'];
const KEY_PATTERN = /^[a-z0-9_]+$/;

/**
 * GET /api/admin/compliance/requirements
 * Lists all compliance requirements (seeding the defaults on first access),
 * each with a `usageCount` of how many staff records reference it.
 */
export async function GET() {
  try {
    if (!(await isAdmin())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await dbConnect();
    await ensureRequirementsSeeded();

    const [requirements, usage] = await Promise.all([
      ComplianceRequirement.find({}).sort({ isMandatory: -1, label: 1 }).lean(),
      getRequirementUsageCounts(),
    ]);

    const data = requirements.map((r: any) => ({
      ...r,
      usageCount: usage[r.key] ?? 0,
    }));

    return NextResponse.json({ success: true, requirements: data });
  } catch (err: any) {
    console.error('[Compliance Requirements GET] Error:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Failed to load requirements' }, { status: 500 });
  }
}

/**
 * POST /api/admin/compliance/requirements
 * Create a new compliance requirement.
 */
export async function POST(request: Request) {
  try {
    if (!(await isAdmin())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await dbConnect();

    const body = await request.json().catch(() => ({}));

    const key = typeof body.key === 'string' ? body.key.trim().toLowerCase() : '';
    const label = typeof body.label === 'string' ? body.label.trim() : '';

    if (!key || !KEY_PATTERN.test(key)) {
      return NextResponse.json(
        { error: 'Key is required and may contain only lowercase letters, numbers, and underscores.' },
        { status: 400 }
      );
    }
    if (!label) {
      return NextResponse.json({ error: 'Label is required.' }, { status: 400 });
    }

    const evidenceMode: ComplianceEvidenceMode = EVIDENCE_MODES.includes(body.evidenceMode)
      ? body.evidenceMode
      : 'file';

    const existing = await ComplianceRequirement.findOne({ key });
    if (existing) {
      console.warn('[Compliance Requirements POST] Duplicate key', { key });
      return NextResponse.json({ error: `A requirement with key "${key}" already exists.` }, { status: 409 });
    }

    const requirement = await ComplianceRequirement.create({
      key,
      label,
      description: typeof body.description === 'string' ? body.description.trim() : '',
      appliesToAll: body.appliesToAll === true,
      appliesToPositions: Array.isArray(body.appliesToPositions)
        ? body.appliesToPositions.map((p: any) => String(p).trim()).filter(Boolean)
        : [],
      collectAtApplication: !!body.collectAtApplication,
      evidenceMode,
      requiresExpiry: !!body.requiresExpiry,
      expiryCheckDays: Number.isFinite(body.expiryCheckDays) ? Math.max(0, Math.floor(body.expiryCheckDays)) : 30,
      isMandatory: body.isMandatory !== false,
      active: body.active !== false,
      retentionDays: Number.isFinite(body.retentionDays) ? Math.max(0, Math.floor(body.retentionDays)) : null,
    });

    console.log('[Compliance Requirements POST] created', {
      key,
      appliesToAll: requirement.appliesToAll,
      positions: requirement.appliesToPositions.length,
      collectAtApplication: requirement.collectAtApplication,
      isMandatory: requirement.isMandatory,
    });
    // Targeting a new requirement changes who's (non-)compliant — refresh sort keys.
    try { await refreshStaffComplianceStatus(); } catch (e: any) { console.error('[Compliance Requirements POST] refresh failed:', e?.message || e); }
    return NextResponse.json({ success: true, requirement }, { status: 201 });
  } catch (err: any) {
    console.error('[Compliance Requirements POST] Error:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Failed to create requirement' }, { status: 500 });
  }
}
