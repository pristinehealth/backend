import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import Staff from '@/models/Staff';
import ComplianceRequirement from '@/models/ComplianceRequirement';
import StaffComplianceRecord from '@/models/StaffComplianceRecord';
import ComplianceEvidence from '@/models/ComplianceEvidence';
import ComplianceEvent from '@/models/ComplianceEvent';
import UploadAsset from '@/models/UploadAsset';
import { deleteAssetByUrl } from '@/lib/cloudinary';
import { refreshStaffComplianceStatus, isExpiryElapsed } from '@/lib/compliance';

export const dynamic = 'force-dynamic';

type Action = 'verify' | 'reject' | 'set_expiry' | 'add_evidence' | 'assign' | 'unassign';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const role = session.user.role;
  if (role !== 'admin' && role !== 'superadmin') return null;
  return session.user.name || session.user.email || 'Admin';
}

/**
 * POST /api/admin/compliance/staff/[staffId]/[requirementKey]
 * Body: { action, reason?, expiryDate?, evidence?: { fileUrl, fileName, deliveryMethod?, source?, metadata? } }
 *
 * Upserts the StaffComplianceRecord and writes a ComplianceEvent for every
 * change. This is the write path that turns fallback-derived status into an
 * authoritative record (write-time migration).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ staffId: string; requirementKey: string }> }
) {
  try {
    const actor = await requireAdmin();
    if (!actor) {
      console.warn('[Compliance Staff Action] Unauthorized request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    const { staffId, requirementKey } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      action?: Action;
      reason?: string;
      expiryDate?: string | null;
      evidence?: { fileUrl?: string; fileName?: string; reference?: string; deliveryMethod?: string; source?: string; publicId?: string };
    };
    const action = body.action;
    const now = new Date();
    console.log('[Compliance Staff Action] start', { actor, staffId, requirementKey, action });

    const staff = await Staff.findOne({ staffid: staffId }).select('staffid email').lean();
    if (!staff) {
      console.warn('[Compliance Staff Action] Staff not found', { staffId });
      return NextResponse.json({ error: 'Staff not found' }, { status: 404 });
    }
    const staffEmail = ((staff as any).email || '').toLowerCase();

    const requirement = await ComplianceRequirement.findOne({ key: requirementKey }).lean();
    if (!requirement && action === 'assign') {
      console.warn('[Compliance Staff Action] Assign to unknown requirement', { staffId, requirementKey });
      return NextResponse.json({ error: `Unknown requirement "${requirementKey}"` }, { status: 400 });
    }

    // --- unassign: remove a manual assignment ---------------------------------
    if (action === 'unassign') {
      const record = await StaffComplianceRecord.findOne({ staffId, requirementKey });
      if (!record) {
        console.warn('[Compliance Staff Action] Unassign: no record to remove', { staffId, requirementKey });
        return NextResponse.json({ error: 'No record to remove' }, { status: 404 });
      }
      if (!record.assignedManually) {
        console.warn('[Compliance Staff Action] Unassign refused (not manual)', { staffId, requirementKey });
        return NextResponse.json(
          { error: 'This requirement applies via role/position and cannot be unassigned. Deactivate the requirement instead.' },
          { status: 400 }
        );
      }
      // Securely delete the evidence files from Cloudinary before removing the
      // records — otherwise unassigning would orphan the files.
      const evs = await ComplianceEvidence.find({ recordId: record._id }).select('fileUrl').lean();
      let filesDeleted = 0;
      for (const ev of evs as any[]) {
        if (ev.fileUrl) {
          try { await deleteAssetByUrl(ev.fileUrl); filesDeleted += 1; } catch (e: any) {
            console.error('[Compliance Unassign] Cloudinary delete failed:', e?.message || e);
          }
        }
      }
      await ComplianceEvidence.deleteMany({ recordId: record._id });
      await StaffComplianceRecord.deleteOne({ _id: record._id });
      console.log('[Compliance Staff Action] unassigned', { staffId, requirementKey, filesDeleted, evidenceRemoved: evs.length });
      try { await refreshStaffComplianceStatus([staffId]); } catch (e: any) { console.error('[Compliance Staff Action] refresh failed:', e?.message || e); }
      return NextResponse.json({ success: true, removed: true, filesDeleted });
    }

    // --- everything else upserts the record -----------------------------------
    let record = await StaffComplianceRecord.findOne({ staffId, requirementKey });
    let created = false;
    if (!record) {
      record = await StaffComplianceRecord.create({
        staffId,
        staffEmail,
        requirementKey,
        status: 'missing',
        assignedManually: action === 'assign',
        lastCheckedAt: now,
      });
      created = true;
      console.log('[Compliance Staff Action] record created', { staffId, requirementKey, via: action });
      await ComplianceEvent.create({
        recordId: record._id,
        eventType: 'record_created',
        actor,
        payload: { via: action },
      });
    }

    const events: Array<{ eventType: string; payload: any }> = [];

    switch (action) {
      case 'assign': {
        if (!record.assignedManually) record.assignedManually = true;
        break; // record_created event already covers a fresh assignment
      }
      case 'verify': {
        record.status = 'verified';
        record.verifiedAt = now;
        record.verifiedBy = actor;
        record.rejectionReason = null;
        if (body.expiryDate !== undefined) {
          record.expiryDate = body.expiryDate ? new Date(body.expiryDate) : null;
        }
        if (record.expiryDate && isExpiryElapsed(record.expiryDate, now)) {
          record.status = 'expired';
        }
        events.push({ eventType: 'verified', payload: { expiryDate: record.expiryDate } });
        break;
      }
      case 'reject': {
        record.status = 'rejected';
        record.rejectionReason = body.reason?.trim() || 'Rejected by admin';
        record.verifiedAt = null;
        record.verifiedBy = null;
        events.push({ eventType: 'rejected', payload: { reason: record.rejectionReason } });
        break;
      }
      case 'set_expiry': {
        record.expiryDate = body.expiryDate ? new Date(body.expiryDate) : null;
        if (record.expiryDate && isExpiryElapsed(record.expiryDate, now)) {
          record.status = 'expired';
        } else if (record.status === 'expired') {
          record.status = record.verifiedAt ? 'verified' : 'pending';
        }
        events.push({ eventType: 'expiry_set', payload: { expiryDate: record.expiryDate } });
        break;
      }
      case 'add_evidence': {
        const ev = body.evidence || {};
        const hasFile = !!ev.fileUrl;
        // Replace (no history): delete existing evidence + their Cloudinary files,
        // then add the new one as the only evidence for this requirement.
        const prior = await ComplianceEvidence.find({ recordId: record._id }).select('fileUrl').lean();
        for (const pe of prior as any[]) {
          if (pe.fileUrl && pe.fileUrl !== ev.fileUrl) {
            try { await deleteAssetByUrl(pe.fileUrl); } catch (e: any) {
              console.error('[Compliance Evidence] Cloudinary delete failed:', e?.message || e);
            }
          }
        }
        if (prior.length) {
          console.log('[Compliance Staff Action] evidence replaced', { staffId, requirementKey, priorCount: prior.length, hasFile });
        }
        await ComplianceEvidence.deleteMany({ recordId: record._id });
        await ComplianceEvidence.create({
          recordId: record._id,
          source: ev.source || (hasFile ? 'admin_upload' : 'admin_metadata_record'),
          deliveryMethod: ev.deliveryMethod || (hasFile ? 'upload' : 'manual'),
          reference: (ev.reference || '').toString().trim(),
          fileUrl: ev.fileUrl || '',
          fileName: ev.fileName || '',
          receivedAt: now,
          isCurrent: true,
        });
        // Mark the uploaded asset consumed so the abandoned-upload cron doesn't
        // delete this evidence file from Cloudinary after 48h.
        if (ev.publicId) {
          await UploadAsset.updateOne(
            { publicId: ev.publicId },
            { $set: { status: 'consumed', consumedAt: now, usageType: 'supporting_document' } }
          );
        }
        if (record.status === 'missing' || record.status === 'rejected') {
          record.status = 'pending';
        }
        record.rejectionReason = null;
        events.push({ eventType: 'evidence_added', payload: { hasFile } });
        break;
      }
      default:
        if (!created) {
          return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 });
        }
    }

    record.lastCheckedAt = now;
    await record.save();

    for (const e of events) {
      await ComplianceEvent.create({ recordId: record._id, eventType: e.eventType, actor, payload: e.payload });
    }

    try { await refreshStaffComplianceStatus([staffId]); } catch (e: any) { console.error('[Compliance Staff Action] refresh failed:', e?.message || e); }

    console.log('[Compliance Staff Action] success', {
      staffId,
      requirementKey,
      action,
      created,
      status: record.status,
      events: events.map((e) => e.eventType),
    });
    return NextResponse.json({ success: true, record });
  } catch (err: any) {
    console.error('[Compliance Staff Action] Error:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Failed to update compliance' }, { status: 500 });
  }
}
