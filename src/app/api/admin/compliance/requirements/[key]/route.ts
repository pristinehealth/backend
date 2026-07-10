import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import ComplianceRequirement, {
  type ComplianceEvidenceMode,
} from '@/models/ComplianceRequirement';
import StaffComplianceRecord from '@/models/StaffComplianceRecord';
import { refreshStaffComplianceStatus } from '@/lib/compliance';

export const dynamic = 'force-dynamic';

async function isAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return false;
  const role = session.user.role;
  return role === 'admin' || role === 'superadmin';
}

const EVIDENCE_MODES: ComplianceEvidenceMode[] = ['file', 'metadata_only', 'either'];

/**
 * PATCH /api/admin/compliance/requirements/[key]
 * Update a requirement's editable fields. The `key` itself is immutable.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    if (!(await isAdmin())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await dbConnect();
    const { key } = await params;

    const requirement = await ComplianceRequirement.findOne({ key });
    if (!requirement) {
      console.warn('[Compliance Requirement PATCH] Not found', { key });
      return NextResponse.json({ error: 'Requirement not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));

    // Evidence mode is LOCKED after creation. Changing file↔metadata would strand
    // already-uploaded Cloudinary files (metadata-only promises "no file stored")
    // and leave a self-contradictory record. To change it, delete + recreate.
    if (
      body.evidenceMode !== undefined &&
      EVIDENCE_MODES.includes(body.evidenceMode) &&
      body.evidenceMode !== requirement.evidenceMode
    ) {
      return NextResponse.json(
        { error: 'Evidence mode is locked after creation. Delete and recreate the requirement to change how evidence is collected.' },
        { status: 400 }
      );
    }

    if (typeof body.label === 'string') {
      const label = body.label.trim();
      if (!label) {
        return NextResponse.json({ error: 'Label cannot be empty.' }, { status: 400 });
      }
      requirement.label = label;
    }
    if (typeof body.description === 'string') requirement.description = body.description.trim();
    if (typeof body.appliesToAll === 'boolean') requirement.appliesToAll = body.appliesToAll;
    if (Array.isArray(body.appliesToPositions)) {
      requirement.appliesToPositions = body.appliesToPositions.map((p: any) => String(p).trim()).filter(Boolean);
    }
    if (typeof body.collectAtApplication === 'boolean') requirement.collectAtApplication = body.collectAtApplication;
    if (body.retentionDays === null) requirement.retentionDays = null;
    else if (Number.isFinite(body.retentionDays)) requirement.retentionDays = Math.max(0, Math.floor(body.retentionDays));
    // evidenceMode intentionally not applied here — it's locked (see check above).
    if (typeof body.requiresExpiry === 'boolean') requirement.requiresExpiry = body.requiresExpiry;
    if (Number.isFinite(body.expiryCheckDays)) {
      requirement.expiryCheckDays = Math.max(0, Math.floor(body.expiryCheckDays));
    }
    if (typeof body.isMandatory === 'boolean') requirement.isMandatory = body.isMandatory;
    if (typeof body.active === 'boolean') requirement.active = body.active;

    await requirement.save();
    try { await refreshStaffComplianceStatus(); } catch (e: any) { console.error('[Compliance Requirement PATCH] refresh failed:', e?.message || e); }
    console.log('[Compliance Requirement PATCH] updated', {
      key,
      changed: Object.keys(body || {}),
      active: requirement.active,
      appliesToAll: requirement.appliesToAll,
    });
    return NextResponse.json({ success: true, requirement });
  } catch (err: any) {
    console.error('[Compliance Requirement PATCH] Error:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Failed to update requirement' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/compliance/requirements/[key]
 * Removes ONLY the requirement definition (the spec of what to collect). The
 * staff's/applicant's evidence — StaffComplianceRecord, ComplianceEvidence,
 * ApplicationDocument and their Cloudinary files — is intentionally KEPT: those
 * files belong to the staff member, not to the requirement. The compliance view
 * still shows them (buildComplianceView's defFor falls back to the stored key),
 * so each staff's files remain visible even after the requirement is gone.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    if (!(await isAdmin())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await dbConnect();
    const { key } = await params;

    const deleted = await ComplianceRequirement.findOneAndDelete({ key });
    if (!deleted) {
      console.warn('[Compliance Requirement DELETE] Not found', { key });
      return NextResponse.json({ error: 'Requirement not found' }, { status: 404 });
    }

    const orphanedRecords = await StaffComplianceRecord.countDocuments({ requirementKey: key });
    try { await refreshStaffComplianceStatus(); } catch (e: any) { console.error('[Compliance Requirement DELETE] refresh failed:', e?.message || e); }
    console.log('[Compliance Requirement DELETE] deleted (evidence preserved)', { key, orphanedRecords });
    return NextResponse.json({
      success: true,
      message: 'Requirement deleted. Existing staff evidence/files are kept and still visible.',
      evidencePreserved: true,
    });
  } catch (err: any) {
    console.error('[Compliance Requirement DELETE] Error:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Failed to delete requirement' }, { status: 500 });
  }
}
