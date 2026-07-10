/**
 * Migration 002 — backfill staff compliance records + evidence + audit events.
 *
 * For each active staff member and each active compliance requirement:
 *   1. Upsert a StaffComplianceRecord (unique on staffId + requirementKey).
 *   2. Derive its status/expiry/evidence from existing StaffDocument, then
 *      from the latest verified/relevant ApplicationDocument (same fallback the
 *      read path in src/lib/compliance.ts performs).
 *   3. On first creation only, backfill a ComplianceEvidence row (source
 *      'migration_backfill') and write 'record_created' + 'migrated' events.
 *
 * Idempotent: records are created with $setOnInsert (existing records — e.g.
 * ones an admin has since edited — are never overwritten), and evidence/events
 * are only written when the record is newly inserted. Re-running is a no-op for
 * already-migrated staff.
 *
 * Run standalone:  node migrations/002-backfill-staff-compliance.js
 * Or via runner:   npm run migrate:compliance
 *
 * Depends on 001 having seeded requirements (falls back to the seed file if the
 * ComplianceRequirement collection is empty).
 */
const REQUIREMENT_SEED = require('./data/complianceRequirements');
const {
  staffDocStatusToCompliance,
  applicationDocStatusToCompliance,
  applyExpiryOverride,
} = require('./lib/statusMap');

function isActiveStaff(s) {
  // Perfex marks active staff with active === '1'. Treat a missing flag as
  // active so we don't silently skip records that predate the field.
  if (s.active === undefined || s.active === null) return true;
  return String(s.active) !== '0' && s.active !== false;
}

async function backfillOneStaff(models, staff, requirements, now) {
  const { StaffDocument, ApplicationDocument, JobApplication } = models;
  const { StaffComplianceRecord, ComplianceEvidence, ComplianceEvent } = models;

  const staffId = String(staff.staffid);
  const staffEmail = (staff.email || '').trim().toLowerCase();
  const staffRole = staff.role || null;

  // Latest legacy StaffDocument per type.
  const staffDocs = await StaffDocument.find({ staffId }).sort({ uploadedAt: -1 }).lean();
  const staffDocByType = new Map();
  for (const doc of staffDocs) {
    if (!staffDocByType.has(doc.documentType)) staffDocByType.set(doc.documentType, doc);
  }

  // Latest ApplicationDocument per type (from the most recent application).
  const appDocByType = new Map();
  if (staffEmail) {
    const application = await JobApplication.findOne({
      applicantEmail: { $regex: new RegExp(`^${staffEmail}$`, 'i') },
    })
      .sort({ createdAt: -1 })
      .lean();
    if (application) {
      const appDocs = await ApplicationDocument.find({ applicationId: application._id })
        .sort({ uploadedAt: -1 })
        .lean();
      for (const doc of appDocs) {
        if (!appDocByType.has(doc.documentType)) appDocByType.set(doc.documentType, doc);
      }
    }
  }

  const stats = { recordsCreated: 0, recordsExisting: 0, evidenceCreated: 0 };

  for (const req of requirements) {
    // Requirement with a role list only applies to matching roles.
    if (Array.isArray(req.appliesToRoles) && req.appliesToRoles.length > 0) {
      if (!staffRole || !req.appliesToRoles.includes(staffRole)) continue;
    }

    // Derive status + evidence: StaffDocument first, then ApplicationDocument.
    let status = 'missing';
    let expiryDate = null;
    let evidence = null;
    let source = 'none';

    const staffDoc = staffDocByType.get(req.key);
    const appDoc = appDocByType.get(req.key);

    if (staffDoc) {
      expiryDate = staffDoc.expiryDate ? new Date(staffDoc.expiryDate) : null;
      status = applyExpiryOverride(staffDocStatusToCompliance(staffDoc.status), expiryDate, now);
      source = 'staff_document';
      if (staffDoc.fileUrl || staffDoc.fileName) {
        evidence = {
          deliveryMethod: staffDoc.deliveryMethod || 'upload',
          fileUrl: staffDoc.fileUrl || '',
          fileName: staffDoc.fileName || '',
        };
      }
    } else if (appDoc) {
      expiryDate = appDoc.expiryDate ? new Date(appDoc.expiryDate) : null;
      status = applyExpiryOverride(applicationDocStatusToCompliance(appDoc.status), expiryDate, now);
      source = 'application_document';
      if (appDoc.fileUrl || appDoc.fileName) {
        evidence = {
          deliveryMethod: appDoc.deliveryMethod || 'upload',
          fileUrl: appDoc.fileUrl || '',
          fileName: appDoc.fileName || '',
        };
      }
    }

    const res = await StaffComplianceRecord.updateOne(
      { staffId, requirementKey: req.key },
      {
        $setOnInsert: {
          staffId,
          staffEmail,
          requirementKey: req.key,
          status,
          dueDate: null,
          expiryDate,
          verifiedAt: status === 'verified' ? now : null,
          verifiedBy: status === 'verified' ? 'migration_backfill' : null,
          lastCheckedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true }
    );

    if (!res.upsertedCount) {
      stats.recordsExisting += 1;
      continue; // Existing record — leave it (and its history) untouched.
    }

    stats.recordsCreated += 1;
    const recordId = res.upsertedId && (res.upsertedId._id || res.upsertedId);

    if (evidence) {
      await ComplianceEvidence.create({
        recordId,
        source: 'migration_backfill',
        deliveryMethod: evidence.deliveryMethod,
        fileUrl: evidence.fileUrl,
        fileName: evidence.fileName,
        metadata: { backfilledFrom: source },
        receivedAt: now,
        isCurrent: true,
        createdAt: now,
        updatedAt: now,
      });
      stats.evidenceCreated += 1;
    }

    await ComplianceEvent.create({
      recordId,
      eventType: 'record_created',
      actor: 'system',
      payload: { migration: '002-backfill-staff-compliance' },
      createdAt: now,
    });
    await ComplianceEvent.create({
      recordId,
      eventType: 'migrated',
      actor: 'system',
      payload: { source, status, hadEvidence: !!evidence },
      createdAt: now,
    });
  }

  return stats;
}

async function up(models) {
  const { ComplianceRequirement, Staff } = models;
  const now = new Date();

  const persisted = await ComplianceRequirement.find({ active: true }).lean();
  const requirements = persisted.length ? persisted : REQUIREMENT_SEED;
  if (!persisted.length) {
    console.log('[002-backfill] ComplianceRequirement empty — using seed file (run 001 first for persistence)');
  }

  const allStaff = await Staff.find({}).lean();
  const activeStaff = allStaff.filter(isActiveStaff);
  console.log(
    `[002-backfill] staff: ${allStaff.length} total, ${activeStaff.length} active; requirements: ${requirements.length}`
  );

  const totals = { staffProcessed: 0, recordsCreated: 0, recordsExisting: 0, evidenceCreated: 0 };
  for (const staff of activeStaff) {
    if (!staff.staffid) continue;
    const stats = await backfillOneStaff(models, staff, requirements, now);
    totals.staffProcessed += 1;
    totals.recordsCreated += stats.recordsCreated;
    totals.recordsExisting += stats.recordsExisting;
    totals.evidenceCreated += stats.evidenceCreated;
  }

  console.log(
    `[002-backfill] done — staff processed: ${totals.staffProcessed}, records created: ${totals.recordsCreated}, ` +
      `already existed: ${totals.recordsExisting}, evidence backfilled: ${totals.evidenceCreated}`
  );
  return totals;
}

module.exports = { up };

// Allow standalone execution.
if (require.main === module) {
  const { connect, disconnect, buildModels } = require('./lib/db');
  (async () => {
    await connect();
    try {
      await up(buildModels());
    } finally {
      await disconnect();
    }
  })().catch((err) => {
    console.error('[002-backfill] failed:', err);
    process.exit(1);
  });
}
