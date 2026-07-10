import ApplicationDocument from '@/models/ApplicationDocument';
import StaffComplianceRecord from '@/models/StaffComplianceRecord';
import ComplianceEvidence from '@/models/ComplianceEvidence';
import ComplianceEvent from '@/models/ComplianceEvent';
import Staff from '@/models/Staff';
import JobApplication from '@/models/JobApplication';
import JobPosition from '@/models/JobPosition';
import dbConnect from '@/lib/mongoose';
import { deleteAssetByUrl } from '@/lib/cloudinary';
import { getAllRequirementDefinitions, isExpiryElapsed } from '@/lib/compliance';

/**
 * Materialize an accepted application's verified documents into authoritative
 * compliance records + evidence. Called when an applicant is accepted (see the
 * application status endpoint).
 *
 * Each `ApplicationDocument.documentType` is a compliance requirement `key`. For
 * every VERIFIED application document we create a `StaffComplianceRecord`
 * (status `verified`, since it was already reviewed during hiring) plus a
 * `ComplianceEvidence` (source `applicant_upload`) carrying the file/expiry, and
 * append the `record_created` + `evidence_added` audit events. This is the
 * write-time migration that makes the staff view read authoritative records
 * instead of re-deriving status from the application every request.
 *
 * Idempotent: any requirement the staff member already has a record for is
 * skipped — never clobbering admin-entered evidence or an earlier
 * materialization. Per-document failures (e.g. a unique-key race) are isolated
 * so one bad document can't abort the batch.
 *
 * `staffId` should be the real Perfex staffid when known; if omitted it falls
 * back to the email as the key (accept-before-sync). The sync reconcile re-keys
 * email-keyed records to the real staffid once the person appears in Perfex.
 */
export async function linkApplicationDocumentsToStaff(
  applicationId: string,
  staffEmail: string,
  staffId?: string
): Promise<{ success: boolean; linkedCount: number; skippedCount: number; error?: string }> {
  try {
    await dbConnect();

    const resolvedStaffId = staffId || staffEmail;
    const emailLc = (staffEmail || '').toLowerCase();
    const now = new Date();

    const appDocs = await ApplicationDocument.find({
      applicationId,
      status: 'verified', // Only materialize documents an admin verified.
    }).lean();

    if (!appDocs.length) {
      console.log(`[Compliance Materialize] No verified documents for application ${applicationId}`);
      return { success: true, linkedCount: 0, skippedCount: 0 };
    }

    // Idempotency: skip requirement keys this staff already has a record for.
    const existing = await StaffComplianceRecord.find({ staffId: resolvedStaffId })
      .select('requirementKey')
      .lean();
    const alreadyHave = new Set((existing as any[]).map((r) => r.requirementKey));

    let linkedCount = 0;
    let skippedCount = 0;

    for (const appDoc of appDocs as any[]) {
      const requirementKey = appDoc.documentType;
      if (!requirementKey || alreadyHave.has(requirementKey)) {
        skippedCount += 1;
        continue;
      }
      try {
        const hasFile = !!appDoc.fileUrl;
        const expiry: Date | null = appDoc.expiryDate ? new Date(appDoc.expiryDate) : null;
        const record = await StaffComplianceRecord.create({
          staffId: resolvedStaffId,
          staffEmail: emailLc,
          requirementKey,
          // It was verified during application review — carry that forward, but
          // downgrade to expired if the carried expiry day has fully elapsed.
          status: expiry && isExpiryElapsed(expiry, now) ? 'expired' : 'verified',
          verifiedAt: now,
          verifiedBy: 'System (application accepted)',
          expiryDate: expiry,
          lastCheckedAt: now,
          assignedManually: false,
        });

        await ComplianceEvidence.create({
          recordId: record._id,
          source: 'applicant_upload',
          deliveryMethod: appDoc.deliveryMethod === 'email' ? 'email' : 'upload',
          // For metadata-only docs, carry the recorded value (e.g. the ID number
          // the applicant entered) forward as the evidence reference.
          reference: appDoc.value || '',
          fileUrl: appDoc.fileUrl || '',
          fileName: appDoc.fileName || '',
          receivedAt: appDoc.uploadedAt ? new Date(appDoc.uploadedAt) : now,
          isCurrent: true,
        });

        await ComplianceEvent.create({
          recordId: record._id,
          eventType: 'record_created',
          actor: 'System',
          payload: { via: 'application_accepted', applicationId },
        });
        await ComplianceEvent.create({
          recordId: record._id,
          eventType: 'evidence_added',
          actor: 'System',
          payload: { source: 'applicant_upload', hasFile },
        });

        alreadyHave.add(requirementKey);
        linkedCount += 1;
      } catch (itemErr: any) {
        // Unique (staffId, requirementKey) race or bad data — isolate it.
        skippedCount += 1;
        console.error(
          `[Compliance Materialize] Skipped "${requirementKey}" for ${resolvedStaffId}:`,
          itemErr?.message || itemErr
        );
      }
    }

    console.log(
      `[Compliance Materialize] Created ${linkedCount} record(s) (skipped ${skippedCount}) for staff ${resolvedStaffId} from application ${applicationId}`
    );

    return { success: true, linkedCount, skippedCount };
  } catch (err: any) {
    console.error('[Compliance Materialize] Error:', err?.message || err);
    return {
      success: false,
      linkedCount: 0,
      skippedCount: 0,
      error: err?.message || 'Unknown error',
    };
  }
}

/**
 * Self-heal the accept-before-Perfex-sync case.
 *
 * When an application is accepted before the person exists as a `Staff` row,
 * their compliance records are keyed by email (a `staffId` containing "@").
 * Once the Perfex sync creates the real `Staff` row, this re-keys that data to
 * the real `staffid`, completes the deferred application link, and back-fills
 * the hired position — so reads (which key on `staffid`) see everything.
 * Bounded by the number of email-keyed leftovers (normally zero), so it is
 * cheap to run on every staff sync.
 */
export async function reconcileEmailKeyedCompliance(): Promise<{
  recordsReKeyed: number;
  recordsMerged: number;
  positionsStamped: number;
  applicationsLinked: number;
}> {
  await dbConnect();

  const emailKeys: string[] = await StaffComplianceRecord.distinct('staffId', { staffId: /@/ });

  let recordsReKeyed = 0;
  let recordsMerged = 0;
  let positionsStamped = 0;
  let applicationsLinked = 0;

  // Complete the deferred staff↔application link for accept-before-sync hires.
  // An application accepted while the staff didn't yet exist has
  // acceptedStaffId still null. Now that the sync may have created the staff,
  // match by email (once) and stamp the definitive link. Bounded by the number
  // of not-yet-linked accepted applications (normally zero).
  const unlinkedAccepted = await JobApplication.find({
    status: 'accepted',
    $or: [{ acceptedStaffId: null }, { acceptedStaffId: { $exists: false } }],
  })
    .select('_id applicantEmail')
    .lean();
  for (const app of unlinkedAccepted as any[]) {
    const email = String(app.applicantEmail || '').trim();
    if (!email) continue;
    const staff = await Staff.findOne({ email: new RegExp(`^${email}$`, 'i') })
      .select('staffid')
      .lean();
    const staffid = (staff as any)?.staffid;
    if (!staffid) continue; // still not synced — try again next sync
    await JobApplication.updateOne(
      { _id: app._id },
      { $set: { acceptedStaffId: String(staffid) } }
    );
    applicationsLinked += 1;
  }

  for (const emailKey of emailKeys) {
    const staff = await Staff.findOne({
      email: new RegExp(`^${emailKey.trim()}$`, 'i'),
    })
      .select('staffid positionId')
      .lean();
    const staffid = (staff as any)?.staffid;
    if (!staffid || staffid === emailKey) continue;

    // StaffComplianceRecord has a unique (staffId, requirementKey) index — move
    // records that don't collide, drop email-keyed duplicates where a real
    // record already exists.
    const records = await StaffComplianceRecord.find({ staffId: emailKey });
    for (const rec of records) {
      const clash = await StaffComplianceRecord.findOne({
        staffId: staffid,
        requirementKey: rec.requirementKey,
      });
      if (clash) {
        await StaffComplianceRecord.deleteOne({ _id: rec._id });
        recordsMerged += 1;
      } else {
        rec.staffId = staffid;
        await rec.save();
        recordsReKeyed += 1;
      }
    }

    // Back-fill position from the latest accepted application if not set yet.
    if (!(staff as any)?.positionId) {
      const app = await JobApplication.findOne({
        applicantEmail: new RegExp(`^${emailKey.trim()}$`, 'i'),
        status: 'accepted',
      })
        .sort({ updatedAt: -1 })
        .lean();
      if (app) {
        const job = await JobPosition.findById((app as any).jobId).select('title').lean();
        await Staff.updateOne(
          { staffid: staffid },
          { $set: { positionId: String((app as any).jobId), positionTitle: (job as any)?.title || null } }
        );
        positionsStamped += 1;
      }
    }
  }

  if (recordsReKeyed || recordsMerged || positionsStamped || applicationsLinked) {
    console.log(
      `[Compliance Reconcile] re-keyed ${recordsReKeyed} record(s), merged ${recordsMerged}, stamped ${positionsStamped} position(s), linked ${applicationsLinked} application(s)`
    );
  }

  return { recordsReKeyed, recordsMerged, positionsStamped, applicationsLinked };
}

/**
 * Archive (don't delete) a terminated staff member's compliance data.
 *
 * Called when the Perfex sync removes a `Staff` row. Instead of silently
 * orphaning the person's documents/records, we stamp `archivedAt` — which
 * starts the retention clock. Nothing is deleted here; secure disposal happens
 * later, only for requirements that have an explicit retention period
 * (`disposeExpiredComplianceData`). Idempotent: already-archived rows are left.
 */
export async function archiveTerminatedStaff(
  staffIds: string[]
): Promise<{ recordsArchived: number }> {
  const ids = Array.from(new Set(staffIds.map(String).filter(Boolean)));
  if (!ids.length) return { recordsArchived: 0 };

  await dbConnect();
  const now = new Date();
  const r = await StaffComplianceRecord.updateMany(
    { staffId: { $in: ids }, archivedAt: null },
    { $set: { archivedAt: now } }
  );

  const recordsArchived = r.modifiedCount || 0;
  if (recordsArchived) {
    console.log(
      `[Compliance Archive] archived ${recordsArchived} record(s) for ${ids.length} terminated staff`
    );
  }
  return { recordsArchived };
}

export interface DisposeResult {
  dryRun: boolean;
  recordsDisposed: number;
  evidenceDisposed: number;
  filesDeleted: number;
  items: Array<{ type: 'record'; staffId: string; key: string; disposeAt: string }>;
}

/**
 * Securely dispose compliance data whose retention window has elapsed.
 *
 * A record is eligible only when ALL of these hold:
 *  - it is archived (`archivedAt` set — i.e. the staff member was terminated),
 *  - its requirement has a non-null `retentionDays` (indefinite = never disposed),
 *  - `archivedAt + retentionDays` is in the past, AND
 *  - the `staffId` is NOT currently an active staff member (safety: if they
 *    returned to Perfex, we never dispose).
 *
 * Deletes the Cloudinary file, the evidence, and the record, and writes an
 * append-only `disposed` audit event. Defaults to **dry-run** — pass
 * `{ dryRun: false }` to actually delete.
 *
 * `force` (only honored together with `staffId`) is a manual override: it
 * disposes ALL of that terminated staff member's archived items regardless of
 * retention period or whether the window has elapsed — for clearing data on
 * requirements that never had a retention set ("held indefinitely"). The
 * active-staff safety still applies (a returned staff member is never disposed).
 */
export async function disposeExpiredComplianceData(opts?: {
  dryRun?: boolean;
  staffId?: string; // scope disposal to one terminated staff member
  force?: boolean;  // manual override: ignore retention window (requires staffId)
}): Promise<DisposeResult> {
  await dbConnect();
  const dryRun = opts?.dryRun ?? true;
  const scopeStaffId = opts?.staffId ? String(opts.staffId) : null;
  const force = !!opts?.force && !!scopeStaffId; // force is scoped-only, never global
  const now = new Date();

  const reqs = await getAllRequirementDefinitions();
  const retentionByKey = new Map<string, number | null>(reqs.map((r) => [r.key, r.retentionDays]));

  // Never dispose data for someone who is currently on staff (safety if they
  // returned to Perfex). Staff is keyed by `staffid`.
  const activeStaff = new Set<string>((await Staff.distinct('staffid')).map(String));

  const result: DisposeResult = {
    dryRun,
    recordsDisposed: 0,
    evidenceDisposed: 0,
    filesDeleted: 0,
    items: [],
  };

  const isActive = (staffId: string) => activeStaff.has(String(staffId));
  const elapsed = (archivedAt: Date, days: number) =>
    new Date(new Date(archivedAt).getTime() + days * 86400000);

  const archivedFilter: any = { archivedAt: { $ne: null } };
  if (scopeStaffId) archivedFilter.staffId = scopeStaffId;

  // Compliance records (+ their evidence).
  const records = await StaffComplianceRecord.find(archivedFilter).lean();
  for (const rec of records as any[]) {
    if (isActive(String(rec.staffId))) continue;
    const rd = retentionByKey.get(rec.requirementKey);
    let disposeAt: Date;
    if (force) {
      disposeAt = now; // manual override — dispose now regardless of retention
    } else {
      if (rd == null) continue; // indefinite / legal hold
      disposeAt = elapsed(rec.archivedAt, rd);
      if (disposeAt > now) continue;
    }

    const evs = await ComplianceEvidence.find({ recordId: rec._id }).lean();
    for (const ev of evs as any[]) {
      if (ev.fileUrl) {
        if (!dryRun) await deleteAssetByUrl(ev.fileUrl);
        result.filesDeleted += 1;
      }
    }
    result.evidenceDisposed += evs.length;
    result.recordsDisposed += 1;
    result.items.push({ type: 'record', staffId: String(rec.staffId), key: rec.requirementKey, disposeAt: disposeAt.toISOString() });

    if (!dryRun) {
      // Write the append-only audit event FIRST, so a failure here can't leave
      // evidence/record already deleted with no audit trail.
      await ComplianceEvent.create({
        recordId: rec._id,
        eventType: 'disposed',
        actor: 'system',
        payload: { requirementKey: rec.requirementKey, retentionDays: rd, forced: force, disposedAt: now },
      });
      await ComplianceEvidence.deleteMany({ recordId: rec._id });
      await StaffComplianceRecord.deleteOne({ _id: rec._id });
    }
  }

  console.log(
    `[Compliance Dispose] ${dryRun ? 'DRY-RUN' : 'LIVE'} — ${result.recordsDisposed} record(s), ${result.filesDeleted} file(s)`
  );
  return result;
}

export type RetentionState = 'held' | 'pending' | 'due' | 'protected';

export interface RetentionItem {
  type: 'record';
  key: string;
  label: string;
  archivedAt: string;
  retentionDays: number | null;
  disposeAt: string | null;
  state: RetentionState;
  hasFile: boolean;
}

export interface RetentionStaff {
  staffId: string;
  staffEmail: string;
  stillActive: boolean; // returned to Perfex — protected from disposal
  earliestArchivedAt: string | null;
  counts: { held: number; pending: number; due: number; protected: number };
  items: RetentionItem[];
}

export interface RetentionOverview {
  summary: {
    archivedStaff: number;
    archivedRecords: number;
    held: number;
    pending: number;
    due: number;
    protected: number;
  };
  staff: RetentionStaff[];
}

/**
 * A read-only view of every archived (terminated) staff member's compliance
 * data and its retention state — for the Retention dashboard.
 *
 * Per item state: `held` (indefinite, no retention set), `pending` (retention
 * set, window not elapsed), `due` (window elapsed, eligible for disposal), or
 * `protected` (the staffid is active again in Perfex, so never disposed).
 */
export async function getRetentionOverview(): Promise<RetentionOverview> {
  await dbConnect();
  const now = new Date();

  const reqs = await getAllRequirementDefinitions();
  const metaByKey = new Map(reqs.map((r) => [r.key, { label: r.label, retentionDays: r.retentionDays }]));
  const activeStaff = new Set<string>((await Staff.distinct('staffid')).map(String));

  const records = await StaffComplianceRecord.find({ archivedAt: { $ne: null } })
    .select('staffId staffEmail requirementKey archivedAt')
    .lean();

  // Which archived records currently have evidence (for the hasFile flag).
  const recordIds = records.map((r: any) => r._id);
  const recordsWithEvidence = new Set<string>();
  if (recordIds.length) {
    const evs = await ComplianceEvidence.find({ recordId: { $in: recordIds }, isCurrent: true, fileUrl: { $ne: '' } })
      .select('recordId')
      .lean();
    for (const ev of evs as any[]) recordsWithEvidence.add(String(ev.recordId));
  }

  const byStaff = new Map<string, RetentionStaff>();
  const ensure = (staffId: string, email: string): RetentionStaff => {
    let s = byStaff.get(staffId);
    if (!s) {
      s = {
        staffId,
        staffEmail: email || '',
        stillActive: activeStaff.has(staffId),
        earliestArchivedAt: null,
        counts: { held: 0, pending: 0, due: 0, protected: 0 },
        items: [],
      };
      byStaff.set(staffId, s);
    }
    if (email && !s.staffEmail) s.staffEmail = email;
    return s;
  };

  const classify = (staffId: string, archivedAt: Date, key: string) => {
    const meta = metaByKey.get(key);
    const retentionDays = meta?.retentionDays ?? null;
    let state: RetentionState;
    let disposeAt: Date | null = null;
    if (retentionDays == null) {
      state = 'held';
    } else {
      disposeAt = new Date(new Date(archivedAt).getTime() + retentionDays * 86400000);
      if (activeStaff.has(staffId)) state = 'protected';
      else if (disposeAt <= now) state = 'due';
      else state = 'pending';
    }
    return { retentionDays, disposeAt, state, label: meta?.label || key };
  };

  const addItem = (
    staffId: string,
    email: string,
    type: 'record',
    key: string,
    archivedAt: Date,
    hasFile: boolean
  ) => {
    const s = ensure(staffId, email);
    const { retentionDays, disposeAt, state, label } = classify(staffId, archivedAt, key);
    s.items.push({
      type,
      key,
      label,
      archivedAt: new Date(archivedAt).toISOString(),
      retentionDays,
      disposeAt: disposeAt ? disposeAt.toISOString() : null,
      state,
      hasFile,
    });
    s.counts[state] += 1;
    const iso = new Date(archivedAt).toISOString();
    if (!s.earliestArchivedAt || iso < s.earliestArchivedAt) s.earliestArchivedAt = iso;
  };

  for (const r of records as any[]) {
    addItem(String(r.staffId), r.staffEmail || '', 'record', r.requirementKey, r.archivedAt, recordsWithEvidence.has(String(r._id)));
  }

  const staff = Array.from(byStaff.values()).sort((a, b) =>
    (a.earliestArchivedAt || '').localeCompare(b.earliestArchivedAt || '')
  );

  const summary = {
    archivedStaff: staff.length,
    archivedRecords: records.length,
    held: staff.reduce((n, s) => n + s.counts.held, 0),
    pending: staff.reduce((n, s) => n + s.counts.pending, 0),
    due: staff.reduce((n, s) => n + s.counts.due, 0),
    protected: staff.reduce((n, s) => n + s.counts.protected, 0),
  };

  return { summary, staff };
}
