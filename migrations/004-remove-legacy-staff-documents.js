/**
 * Migration 004 — remove legacy StaffDocument records now superseded by the new
 * compliance domain (StaffComplianceRecord + ComplianceEvidence).
 *
 * The staff detail page's "Expiry controls / Linked documents" panel reads the
 * StaffDocument collection. Migration 002 backfilled that data into the new
 * compliance records, so these are redundant. This removes them.
 *
 * SAFE BY DEFAULT — nothing is lost:
 *  - A StaffDocument is deleted ONLY if it's fully represented in the new system:
 *      (a) a StaffComplianceRecord exists for { staffId, requirementKey === documentType }, AND
 *      (b) if the doc has a file, a ComplianceEvidence row for that record references
 *          the SAME fileUrl.
 *    Anything not fully represented is SKIPPED and listed, so you can backfill
 *    (re-run 002) and re-run this.
 *  - Cloudinary files are NOT deleted. Migration 002 backfilled ComplianceEvidence
 *    reusing the same fileUrl, so the files are now owned by the new evidence layer
 *    and are still shown by "View evidence". The migration reports any file that
 *    would become truly unreferenced (expected: none) rather than deleting it.
 *
 * DRY-RUN by default. Pass --apply to actually delete the DB records.
 *   node migrations/004-remove-legacy-staff-documents.js           # report only
 *   node migrations/004-remove-legacy-staff-documents.js --apply   # delete records
 */

async function up(models, { apply = false } = {}) {
  const { StaffDocument, StaffComplianceRecord, ComplianceEvidence, ApplicationDocument } = models;

  const staffDocs = await StaffDocument.find({}).lean();
  const toDelete = [];
  const skipped = [];

  for (const sd of staffDocs) {
    const record = await StaffComplianceRecord.findOne({
      staffId: String(sd.staffId),
      requirementKey: sd.documentType,
    }).lean();

    const hasFile = !!sd.fileUrl;
    let fileCaptured = !hasFile;
    if (record && hasFile) {
      const ev = await ComplianceEvidence.findOne({ recordId: record._id, fileUrl: sd.fileUrl }).lean();
      fileCaptured = !!ev;
    }

    if (record && fileCaptured) {
      toDelete.push(sd);
    } else {
      skipped.push({
        staffId: String(sd.staffId),
        documentType: sd.documentType,
        reason: !record ? 'no StaffComplianceRecord' : 'file not captured in ComplianceEvidence',
      });
    }
  }

  // Would deleting these docs orphan any Cloudinary file? A file is safe to keep
  // if ComplianceEvidence, ApplicationDocument, or another StaffDocument still
  // references its URL. (002 reused the URLs, so we expect zero orphans.)
  let orphanFiles = 0;
  for (const sd of toDelete) {
    if (!sd.fileUrl) continue;
    const [inEvidence, inAppDocs, inOtherStaffDocs] = await Promise.all([
      ComplianceEvidence.countDocuments({ fileUrl: sd.fileUrl }),
      ApplicationDocument.countDocuments({ fileUrl: sd.fileUrl }),
      StaffDocument.countDocuments({ fileUrl: sd.fileUrl, _id: { $ne: sd._id } }),
    ]);
    if (inEvidence === 0 && inAppDocs === 0 && inOtherStaffDocs === 0) orphanFiles++;
  }

  console.log(
    `[004-remove-legacy-staff-documents] ${apply ? 'APPLY' : 'DRY-RUN'} — ` +
      `total StaffDocuments: ${staffDocs.length}, deletable (fully represented): ${toDelete.length}, ` +
      `skipped (preserved): ${skipped.length}, files that would be orphaned: ${orphanFiles}`
  );
  if (skipped.length) {
    console.log('[004] skipped — NOT represented in the new system yet (preserved so nothing is lost):');
    for (const s of skipped) console.log(`    - staff ${s.staffId} / ${s.documentType}  (${s.reason})`);
    console.log('[004] backfill these by re-running 002, then re-run 004.');
  }

  if (apply && toDelete.length) {
    const res = await StaffDocument.deleteMany({ _id: { $in: toDelete.map((d) => d._id) } });
    console.log(
      `[004] deleted ${res.deletedCount ?? 0} legacy StaffDocument record(s). ` +
        `Cloudinary files left intact (shared with ComplianceEvidence).`
    );
  } else if (!apply) {
    console.log('[004] dry-run: nothing deleted. Re-run with --apply to delete the deletable records.');
  }

  return { total: staffDocs.length, deletable: toDelete.length, skipped: skipped.length, orphanFiles };
}

module.exports = { up };

// Standalone execution. DRY-RUN unless --apply is passed.
if (require.main === module) {
  const apply = process.argv.includes('--apply');
  const { connect, disconnect, buildModels } = require('./lib/db');
  (async () => {
    await connect();
    try {
      await up(buildModels(), { apply });
    } finally {
      await disconnect();
    }
  })().catch((err) => {
    console.error('[004-remove-legacy-staff-documents] failed:', err);
    process.exit(1);
  });
}
