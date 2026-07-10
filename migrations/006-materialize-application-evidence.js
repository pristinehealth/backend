/**
 * Migration 006 — materialize accepted applications into compliance records.
 *
 * The staff compliance view used to fall back to reading a hire's verified
 * `ApplicationDocument`s (and legacy `StaffDocument`s) live, per request. That
 * fallback has been removed: the view now reads authoritative
 * `StaffComplianceRecord`s only, and new hires get those records written at
 * accept time (see src/lib/documentHelpers.ts › linkApplicationDocumentsToStaff).
 *
 * This backfills EXISTING accepted applications the same way, so already-hired
 * staff keep their compliance instead of showing "missing" once the fallback is
 * gone. For every accepted application, each VERIFIED application document
 * (documentType == requirement key) becomes:
 *   - a StaffComplianceRecord (status verified, or expired if its carried expiry
 *     has already passed), plus
 *   - a ComplianceEvidence (source applicant_upload) carrying the file/expiry,
 *     plus record_created + evidence_added audit events.
 *
 * Staff resolution mirrors the runtime: prefer the definitive `acceptedStaffId`
 * link, else match the Perfex staff by email, else key by email (the sync
 * reconcile re-keys email-keyed records to the real staffid later).
 *
 * Idempotent: a requirement the staff already has a record for is skipped, so
 * re-running (or overlapping with a live accept) never duplicates.
 *
 * Finally drops the now-unused `staffdocuments` collection (the StaffDocument
 * model was deleted — pre-prod, no backward compat).
 *
 * Run standalone:  node migrations/006-materialize-application-evidence.js
 */

async function up(models) {
  const { JobApplication, ApplicationDocument, StaffComplianceRecord, ComplianceEvidence, ComplianceEvent, Staff } = models;
  const now = new Date();

  const accepted = await JobApplication.find({ status: 'accepted' })
    .select('_id applicantEmail acceptedStaffId')
    .lean();

  let recordsCreated = 0;
  let evidenceCreated = 0;
  let appsProcessed = 0;
  let skippedExisting = 0;

  for (const app of accepted) {
    const email = String(app.applicantEmail || '').trim();
    if (!email) continue;

    // Resolve staff key: definitive link → email match → email fallback key.
    let staffId = app.acceptedStaffId ? String(app.acceptedStaffId) : null;
    if (!staffId) {
      const staff = await Staff.findOne({ email: new RegExp(`^${email}$`, 'i') }).select('staffid').lean();
      staffId = staff && staff.staffid ? String(staff.staffid) : email.toLowerCase();
    }
    const staffEmail = email.toLowerCase();

    const appDocs = await ApplicationDocument.find({ applicationId: app._id, status: 'verified' })
      .select('documentType deliveryMethod fileUrl fileName expiryDate uploadedAt')
      .lean();
    if (!appDocs.length) continue;
    appsProcessed++;

    // Idempotency: which requirement keys this staff already has a record for.
    const existing = await StaffComplianceRecord.find({ staffId }).select('requirementKey').lean();
    const alreadyHave = new Set(existing.map((r) => r.requirementKey));

    for (const doc of appDocs) {
      const requirementKey = doc.documentType;
      if (!requirementKey || alreadyHave.has(requirementKey)) {
        skippedExisting++;
        continue;
      }
      const hasFile = !!doc.fileUrl;
      const expiry = doc.expiryDate ? new Date(doc.expiryDate) : null;

      const record = await StaffComplianceRecord.create({
        staffId,
        staffEmail,
        requirementKey,
        status: expiry && expiry.getTime() <= now.getTime() ? 'expired' : 'verified',
        verifiedAt: now,
        verifiedBy: 'Migration 006 (application backfill)',
        expiryDate: expiry,
        lastCheckedAt: now,
        assignedManually: false,
      });
      recordsCreated++;

      await ComplianceEvidence.create({
        recordId: record._id,
        source: 'migration_backfill',
        deliveryMethod: doc.deliveryMethod === 'email' ? 'email' : 'upload',
        reference: '',
        fileUrl: doc.fileUrl || '',
        fileName: doc.fileName || '',
        receivedAt: doc.uploadedAt ? new Date(doc.uploadedAt) : now,
        isCurrent: true,
      });
      evidenceCreated++;

      await ComplianceEvent.create({
        recordId: record._id,
        eventType: 'record_created',
        actor: 'Migration 006',
        payload: { via: 'application_backfill', applicationId: String(app._id) },
      });
      await ComplianceEvent.create({
        recordId: record._id,
        eventType: 'evidence_added',
        actor: 'Migration 006',
        payload: { source: 'migration_backfill', hasFile },
      });

      alreadyHave.add(requirementKey);
    }
  }

  // Drop the retired legacy collection (StaffDocument model was deleted).
  let staffDocsDropped = 0;
  try {
    const coll = models.StaffDocument.collection;
    staffDocsDropped = await coll.countDocuments();
    await coll.drop();
    console.log(`[006-materialize-application-evidence] dropped staffdocuments collection (${staffDocsDropped} doc(s)).`);
  } catch (err) {
    // NamespaceNotFound (26) → collection already gone; that's fine.
    if (err && err.code !== 26) {
      console.warn('[006-materialize-application-evidence] could not drop staffdocuments:', err.message);
    }
  }

  console.log(
    `[006-materialize-application-evidence] processed ${appsProcessed} accepted app(s); ` +
      `created ${recordsCreated} record(s) + ${evidenceCreated} evidence; skipped ${skippedExisting} already-present.`
  );
  return { appsProcessed, recordsCreated, evidenceCreated, skippedExisting, staffDocsDropped };
}

module.exports = { up };

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
    console.error('[006-materialize-application-evidence] failed:', err);
    process.exit(1);
  });
}
