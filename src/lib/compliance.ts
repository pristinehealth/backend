import dbConnect from '@/lib/mongoose';
import ComplianceRequirement, {
  type ComplianceEvidenceMode,
} from '@/models/ComplianceRequirement';
import StaffComplianceRecord, {
  type ComplianceStatus,
} from '@/models/StaffComplianceRecord';
import ComplianceEvidence from '@/models/ComplianceEvidence';
import { type DocumentType } from '@/models/ApplicationDocument';
import Staff from '@/models/Staff';
import { DOCUMENT_METADATA } from '@/lib/documentMetadata';

/**
 * Canonical compliance requirement definitions, derived from the existing
 * document metadata so requirement `key` values line up 1:1 with the current
 * `documentType` values. This array is the seed source of truth: the P1
 * migration persists these into the `ComplianceRequirement` collection, and
 * `getComplianceRequirements()` falls back to it until that seed has run.
 */
export interface ComplianceRequirementDefinition {
  key: string;
  label: string;
  description: string;
  appliesToAll: boolean; // explicit "every staff member"
  appliesToPositions: string[];
  collectAtApplication: boolean;
  evidenceMode: ComplianceEvidenceMode;
  requiresExpiry: boolean;
  expiryCheckDays: number;
  isMandatory: boolean;
  active: boolean;
  retentionDays: number | null; // null = indefinite / legal hold
}

export const COMPLIANCE_REQUIREMENT_SEED: ComplianceRequirementDefinition[] = (
  Object.entries(DOCUMENT_METADATA) as [DocumentType, (typeof DOCUMENT_METADATA)[DocumentType]][]
).map(([key, meta]) => ({
  key,
  label: meta.label,
  description: meta.description,
  // Built-in healthcare requirements apply to everyone by default; new custom
  // requirements default to appliesToAll=false (nobody until targeted).
  appliesToAll: true,
  appliesToPositions: [],
  collectAtApplication: meta.defaultOnApplication,
  evidenceMode: meta.storageMode === 'metadata_only' ? 'metadata_only' : 'file',
  requiresExpiry: meta.requiresExpiry,
  expiryCheckDays: meta.expiryCheckDays ?? 30,
  isMandatory: meta.mandatory,
  active: true,
  // Default: indefinite. Set real periods per requirement (with counsel) before
  // enabling disposal — see docs/retention.md.
  retentionDays: null,
}));


/**
 * Materialize the code seed into the `ComplianceRequirement` collection the
 * first time it's needed (e.g. an admin opens the requirements dashboard), so
 * the defaults become concrete, editable rows. No-op once any requirement
 * exists. Idempotent and safe to call on every request.
 */
export async function ensureRequirementsSeeded(): Promise<void> {
  await dbConnect();
  const count = await ComplianceRequirement.estimatedDocumentCount();
  if (count > 0) return;

  const now = new Date();
  try {
    await ComplianceRequirement.insertMany(
      COMPLIANCE_REQUIREMENT_SEED.map((r) => ({ ...r, createdAt: now, updatedAt: now })),
      { ordered: false }
    );
    console.log('[compliance] seeded requirement defaults into the database');
  } catch (err: any) {
    // Ignore duplicate-key races if two requests seed at once.
    if (err?.code !== 11000) throw err;
  }
}

/**
 * Count how many StaffComplianceRecords reference each requirement key, so the
 * admin UI can warn before deleting a requirement that is in use.
 */
export async function getRequirementUsageCounts(): Promise<Record<string, number>> {
  await dbConnect();
  const rows = await StaffComplianceRecord.aggregate([
    { $group: { _id: '$requirementKey', count: { $sum: 1 } } },
  ]);
  const out: Record<string, number> = {};
  for (const r of rows as { _id: string; count: number }[]) {
    out[r._id] = r.count;
  }
  return out;
}

function mapRequirementDoc(r: any): ComplianceRequirementDefinition {
  return {
    key: r.key,
    label: r.label,
    description: r.description || '',
    appliesToAll: !!r.appliesToAll,
    appliesToPositions: Array.isArray(r.appliesToPositions) ? r.appliesToPositions : [],
    collectAtApplication: !!r.collectAtApplication,
    evidenceMode: r.evidenceMode,
    requiresExpiry: !!r.requiresExpiry,
    expiryCheckDays: r.expiryCheckDays ?? 30,
    isMandatory: !!r.isMandatory,
    active: r.active !== false,
    retentionDays: r.retentionDays ?? null,
  };
}

/**
 * All requirement definitions (active AND inactive) from the DB, or the code
 * seed if not yet seeded. Used to resolve labels/metadata for any requirement,
 * including ones referenced by existing records.
 */
export async function getAllRequirementDefinitions(): Promise<ComplianceRequirementDefinition[]> {
  await dbConnect();
  const persisted = await ComplianceRequirement.find({}).lean();
  return persisted.length ? persisted.map(mapRequirementDoc) : COMPLIANCE_REQUIREMENT_SEED;
}

/** Active requirement definitions only. */
export async function getComplianceRequirements(): Promise<ComplianceRequirementDefinition[]> {
  return (await getAllRequirementDefinitions()).filter((r) => r.active);
}

/**
 * Explicit/opt-in targeting: a requirement applies to a staff member only when
 * `appliesToAll` is set, OR their role is listed, OR their position id is listed.
 * With none of those it applies to NOBODY (attach it manually per staff instead).
 */
export function isTargeted(
  req: Pick<ComplianceRequirementDefinition, 'appliesToAll' | 'appliesToPositions'>,
  positionId?: string | null
): boolean {
  if (req.appliesToAll) return true;
  if (positionId && req.appliesToPositions.includes(positionId)) return true;
  return false;
}

/** Active requirements that target this staff member by role or position. */
export async function getApplicableRequirements(opts: {
  role?: string | null;
  positionId?: string | null;
}): Promise<ComplianceRequirementDefinition[]> {
  const active = await getComplianceRequirements();
  return active.filter((r) => isTargeted(r, opts.positionId));
}

export interface ApplicationDocRequirement {
  documentType: string; // compliance requirement key
  required: boolean;
  label: string;
  requiresFile: boolean; // false = metadata-only receipt
  storageMode: 'file' | 'metadata_only';
  requiresExpiry: boolean;
}

/**
 * The documents to collect on a job's application form, resolved from the
 * compliance catalog — the single source of truth (unification). A requirement
 * is collected for a job when `collectAtApplication` is set and it is either
 * fully global (no role and no position targeting) or position-targeted to this
 * job. Role-only targeting is applied post-hire, not at application time (the
 * applicant has no role yet).
 */
/** Sort severity for the staff list: 3 attention, 2 in-progress, 1 compliant, 0 none. */
export function complianceSeverityOf(sm: {
  total: number; mandatoryMissing: number; expired: number; rejected: number; pending: number; missing: number;
}): number {
  if (sm.total === 0) return 0;
  if (sm.mandatoryMissing > 0 || sm.expired > 0 || sm.rejected > 0) return 3;
  if (sm.pending > 0 || sm.missing > 0) return 2;
  return 1;
}

/**
 * Recompute and persist each staff member's compliance sort key
 * (complianceSeverity / complianceProblemCount) on their Staff record, so the
 * staff-compliance list can sort "issues first" at the DB level with an index
 * instead of computing every staff per request. Pass staffIds to refresh a
 * subset; omit to refresh everyone. Best-effort — callers shouldn't block on it.
 */
export async function refreshStaffComplianceStatus(staffIds?: string[]): Promise<number> {
  await dbConnect();
  const filter = staffIds && staffIds.length ? { staffid: { $in: staffIds } } : {};
  const staff = await Staff.find(filter).select('staffid email role positionId').lean();
  if (!staff.length) return 0;

  const summaries = await computeStaffComplianceSummaries(
    (staff as any[]).map((s) => ({ staffid: String(s.staffid), email: s.email, role: s.role, positionId: s.positionId }))
  );
  const now = new Date();
  const ops = (staff as any[]).map((s) => {
    const sm = summaries.get(String(s.staffid))?.summary;
    const severity = sm ? complianceSeverityOf(sm) : 0;
    const problemCount = sm ? sm.mandatoryMissing + sm.expired + sm.rejected + sm.missing + sm.pending : 0;
    return {
      updateOne: {
        filter: { staffid: s.staffid },
        update: { $set: { complianceSeverity: severity, complianceProblemCount: problemCount, complianceCheckedAt: now } },
      },
    };
  });
  if (ops.length) await Staff.bulkWrite(ops);
  return ops.length;
}

export async function getApplicationDocumentRequirements(
  jobId?: string | null
): Promise<ApplicationDocRequirement[]> {
  const active = await getComplianceRequirements();

  return active
    .filter((r) => {
      if (!r.collectAtApplication) return false;
      // Collect on this form when the requirement applies to everyone OR targets
      // this exact position. (Untargeted → nobody, intentionally excluded.)
      return r.appliesToAll || (!!jobId && r.appliesToPositions.includes(jobId));
    })
    .map((r) => ({
      documentType: r.key,
      required: r.isMandatory,
      label: r.label,
      requiresFile: r.evidenceMode !== 'metadata_only',
      storageMode: r.evidenceMode === 'metadata_only' ? 'metadata_only' : 'file',
      requiresExpiry: r.requiresExpiry,
    }));
}

// ---- Status mapping helpers -------------------------------------------------

/**
 * Whether a date-only expiry has fully elapsed.
 *
 * Expiry dates are entered as a calendar day and stored as UTC midnight. A
 * credential is valid THROUGH the whole of that day, so it only counts as
 * expired once the following day has begun (UTC). Comparing the raw timestamp
 * (`expiry <= now`) instead marks a credential expiring "tomorrow" as expired
 * today for anyone in a timezone behind UTC — e.g. an expiry of 07/10 read as
 * expired on 07/09.
 */
export function isExpiryElapsed(expiry: Date, now: Date = new Date()): boolean {
  const nextDayStartUtc = Date.UTC(
    expiry.getUTCFullYear(),
    expiry.getUTCMonth(),
    expiry.getUTCDate() + 1
  );
  return now.getTime() >= nextDayStartUtc;
}

/**
 * Read-time expiry reconciliation. Drives status purely from the expiry date:
 *  - expiry elapsed  → `expired`
 *  - not elapsed but stored `expired` (e.g. an off-by-one from before, or the
 *    expiry was extended) → recover to `verified`/`pending`
 *  - otherwise → the stored status
 */
function applyExpiryOverride(
  status: ComplianceStatus,
  expiryDate: Date | null,
  now: Date,
  verifiedAt?: Date | string | null
): ComplianceStatus {
  if (expiryDate && isExpiryElapsed(expiryDate, now)) return 'expired';
  if (status === 'expired') return verifiedAt ? 'verified' : 'pending';
  return status;
}

// ---- Compliance view --------------------------------------------------------

export type ComplianceCardSource = 'compliance_record' | 'none';

export interface ComplianceCard {
  requirementKey: string;
  label: string;
  description: string;
  evidenceMode: ComplianceEvidenceMode;
  requiresExpiry: boolean;
  isMandatory: boolean;
  status: ComplianceStatus;
  expiryDate: string | null;
  dueDate: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  lastCheckedAt: string | null;
  rejectionReason: string | null;
  assignedManually: boolean;
  source: ComplianceCardSource;
  recordId: string | null;
  evidence: {
    fileName: string;
    fileUrl: string;
    deliveryMethod: string;
  } | null;
}

export interface ComplianceView {
  cards: ComplianceCard[];
  summary: {
    total: number;
    verified: number;
    pending: number;
    expired: number;
    rejected: number;
    missing: number;
    mandatoryMissing: number;
  };
}

/**
 * Build a per-staff compliance view from authoritative `StaffComplianceRecord`
 * rows only. Records are created directly (admin actions) or materialized from
 * the accepted application at hire time (see `linkApplicationDocumentsToStaff`),
 * so there is no legacy StaffDocument / ApplicationDocument fallback: a
 * requirement with no record is reported as `missing`.
 */
export async function buildComplianceView(opts: {
  staffId: string;
  staffEmail?: string | null;
  role?: string | null;
  positionId?: string | null;
  now?: Date;
}): Promise<ComplianceView> {
  await dbConnect();
  const now = opts.now ?? new Date();

  // Requirement definitions: everything (for label lookup) + the subset that
  // targets this staff member by role/position.
  const allDefs = await getAllRequirementDefinitions();
  const defByKey = new Map<string, ComplianceRequirementDefinition>(allDefs.map((d) => [d.key, d]));
  const applicable = allDefs.filter(
    (d) => d.active && isTargeted(d, opts.positionId)
  );

  // 1) Authoritative compliance records (includes manual assignments).
  const records = await StaffComplianceRecord.find({ staffId: opts.staffId }).lean();
  const recordByKey = new Map<string, any>(records.map((r: any) => [r.requirementKey, r]));

  // Current evidence for those records, in one query.
  const recordIds = records.map((r: any) => r._id);
  const evidenceByRecordId = new Map<string, any>();
  if (recordIds.length) {
    const evidence = await ComplianceEvidence.find({
      recordId: { $in: recordIds },
      isCurrent: true,
    }).lean();
    for (const ev of evidence as any[]) {
      evidenceByRecordId.set(String(ev.recordId), ev);
    }
  }

  // The requirements to render: targeted ones ∪ any a record already exists for
  // (manual assignments and historical records survive even if de-targeted).
  // Requirements the admin exempted for this staff member are hidden and not
  // counted — even if role/position targeting would otherwise apply them.
  const exemptedKeys = new Set((records as any[]).filter((r) => r.exempted).map((r) => r.requirementKey));
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const d of applicable) {
    if (exemptedKeys.has(d.key)) continue;
    if (!seen.has(d.key)) { seen.add(d.key); keys.push(d.key); }
  }
  for (const r of records as any[]) {
    if (r.exempted) continue;
    if (!seen.has(r.requirementKey)) { seen.add(r.requirementKey); keys.push(r.requirementKey); }
  }

  // Fallback def for a record whose requirement was deleted — the staff's file is
  // still theirs and stays visible. Humanize the stored key for a readable label.
  const defFor = (key: string): ComplianceRequirementDefinition =>
    defByKey.get(key) ?? {
      key,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      description: 'This requirement no longer exists — kept for this staff member.',
      appliesToAll: false,
      appliesToPositions: [],
      collectAtApplication: false,
      evidenceMode: 'file',
      requiresExpiry: false,
      expiryCheckDays: 30,
      isMandatory: false,
      active: false,
      retentionDays: null,
    };

  // Compliance is now authoritative-only: every card comes from a
  // StaffComplianceRecord (created directly, or materialized from the accepted
  // application at hire time — see linkApplicationDocumentsToStaff). There is no
  // StaffDocument / live ApplicationDocument fallback anymore; a requirement with
  // no record is simply "missing".
  const cards: ComplianceCard[] = keys.map((key) => {
    const req = defFor(key);
    const base = {
      requirementKey: req.key,
      label: req.label,
      description: req.description,
      evidenceMode: req.evidenceMode,
      requiresExpiry: req.requiresExpiry,
      isMandatory: req.isMandatory,
    };

    const record = recordByKey.get(key);
    if (record) {
      const expiry: Date | null = record.expiryDate ? new Date(record.expiryDate) : null;
      const evidence = evidenceByRecordId.get(String(record._id));
      return {
        ...base,
        status: applyExpiryOverride(record.status, expiry, now, record.verifiedAt),
        expiryDate: expiry ? expiry.toISOString() : null,
        dueDate: record.dueDate ? new Date(record.dueDate).toISOString() : null,
        verifiedAt: record.verifiedAt ? new Date(record.verifiedAt).toISOString() : null,
        verifiedBy: record.verifiedBy ?? null,
        lastCheckedAt: record.lastCheckedAt ? new Date(record.lastCheckedAt).toISOString() : null,
        rejectionReason: record.rejectionReason ?? null,
        assignedManually: !!record.assignedManually,
        source: 'compliance_record' as const,
        recordId: String(record._id),
        evidence: evidence
          ? {
              fileName: evidence.fileName || '',
              fileUrl: evidence.fileUrl || '',
              deliveryMethod: evidence.deliveryMethod || 'upload',
              reference: evidence.reference || '',
            }
          : null,
      };
    }

    // No record for this requirement — nothing on file.
    return {
      ...base,
      status: 'missing' as ComplianceStatus,
      expiryDate: null,
      dueDate: null,
      verifiedAt: null,
      verifiedBy: null,
      lastCheckedAt: null,
      rejectionReason: null,
      assignedManually: false,
      source: 'none' as const,
      recordId: null,
      evidence: null,
    };
  });

  const summary = {
    total: cards.length,
    verified: cards.filter((c) => c.status === 'verified').length,
    pending: cards.filter((c) => c.status === 'pending').length,
    expired: cards.filter((c) => c.status === 'expired').length,
    rejected: cards.filter((c) => c.status === 'rejected').length,
    missing: cards.filter((c) => c.status === 'missing').length,
    mandatoryMissing: cards.filter((c) => c.isMandatory && c.status === 'missing').length,
  };

  return { cards, summary };
}

export interface ComplianceOrgSummary {
  totalStaff: number;
  // staff-level posture
  compliant: number;
  inProgress: number;
  attention: number;
  noData: number;
  // requirement-level totals across all staff
  verified: number;
  pending: number;
  expired: number;
  rejected: number;
  missing: number;
  mandatoryMissing: number;
}

/**
 * Org-wide compliance snapshot for the dashboard overview.
 *
 * Bulk version: instead of running buildComplianceView per staff (O(N) DB
 * round-trips), it loads the catalog + all authoritative records in a fixed
 * handful of queries and resolves each staff member's status in memory. Cost is
 * O(1) queries regardless of headcount.
 */
export interface StaffComplianceSummary {
  summary: {
    total: number;
    verified: number;
    pending: number;
    expired: number;
    rejected: number;
    missing: number;
    mandatoryMissing: number;
  };
}

/**
 * Bulk per-staff compliance summaries — the shared engine behind both the staff
 * compliance table (a page of staff) and the org summary (all staff). Loads the
 * catalog + authoritative records for the given staff in a fixed handful of
 * queries and resolves each in memory. Records-only (no StaffDocument /
 * ApplicationDocument fallback). O(1) queries, not O(N).
 */
export async function computeStaffComplianceSummaries(
  staffList: Array<{ staffid: string; email?: string | null; role?: string | null; positionId?: string | null }>,
  now: Date = new Date()
): Promise<Map<string, StaffComplianceSummary>> {
  await dbConnect();
  const result = new Map<string, StaffComplianceSummary>();
  if (!staffList.length) return result;

  const staffIds = staffList.map((s) => String(s.staffid));

  const [allDefs, records] = await Promise.all([
    getAllRequirementDefinitions(),
    StaffComplianceRecord.find({ staffId: { $in: staffIds } }).select('staffId requirementKey status expiryDate verifiedAt exempted').lean(),
  ]);

  const activeDefs = allDefs.filter((d) => d.active);
  const defByKey = new Map(allDefs.map((d) => [d.key, d]));

  const recordsByStaff = new Map<string, Map<string, any>>();
  for (const r of records as any[]) {
    const sid = String(r.staffId);
    let m = recordsByStaff.get(sid);
    if (!m) { m = new Map(); recordsByStaff.set(sid, m); }
    m.set(r.requirementKey, r);
  }

  for (const s of staffList) {
    const sid = String(s.staffid);
    const recMap = recordsByStaff.get(sid);

    const keys = new Set<string>();
    for (const d of activeDefs) if (isTargeted(d, s.positionId) && !recMap?.get(d.key)?.exempted) keys.add(d.key);
    if (recMap) for (const [k, rec] of recMap) if (!rec.exempted) keys.add(k);

    let verified = 0, pending = 0, expired = 0, rejected = 0, missing = 0, mandatoryMissing = 0;

    for (const key of keys) {
      const def = defByKey.get(key);
      const isMandatory = def?.isMandatory ?? false;

      const rec = recMap?.get(key);
      const status: ComplianceStatus = rec
        ? applyExpiryOverride(rec.status, rec.expiryDate ? new Date(rec.expiryDate) : null, now, rec.verifiedAt)
        : 'missing';

      if (status === 'verified') verified++;
      else if (status === 'pending') pending++;
      else if (status === 'expired') expired++;
      else if (status === 'rejected') rejected++;
      else { missing++; if (isMandatory) mandatoryMissing++; }
    }

    result.set(sid, {
      summary: { total: keys.size, verified, pending, expired, rejected, missing, mandatoryMissing },
    });
  }

  return result;
}

export async function getComplianceSummary(): Promise<ComplianceOrgSummary> {
  await dbConnect();
  const staff = await Staff.find({}).select('staffid email role positionId').lean();
  const summaries = await computeStaffComplianceSummaries(
    (staff as any[]).map((s) => ({ staffid: String(s.staffid), email: s.email, role: s.role, positionId: s.positionId }))
  );

  const out: ComplianceOrgSummary = {
    totalStaff: staff.length,
    compliant: 0, inProgress: 0, attention: 0, noData: 0,
    verified: 0, pending: 0, expired: 0, rejected: 0, missing: 0, mandatoryMissing: 0,
  };

  for (const { summary: sm } of summaries.values()) {
    out.verified += sm.verified;
    out.pending += sm.pending;
    out.expired += sm.expired;
    out.rejected += sm.rejected;
    out.missing += sm.missing;
    out.mandatoryMissing += sm.mandatoryMissing;

    if (sm.total === 0) out.noData += 1;
    else if (sm.mandatoryMissing > 0 || sm.expired > 0 || sm.rejected > 0) out.attention += 1;
    else if (sm.pending > 0 || sm.missing > 0) out.inProgress += 1;
    else out.compliant += 1;
  }

  return out;
}
