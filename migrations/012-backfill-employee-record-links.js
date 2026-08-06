/**
 * Migration 012 — backfill `employeeRecordId` on existing rows (Phase 1).
 *
 * Phase 0 (migration 011) created the EmployeeRecord hub. Phase 1 adds an
 * optional `employeeRecordId` to JobApplication, OnboardingInvite,
 * OnboardingResponse, and ApplicationDocument, dual-written on the create paths.
 * This migration stamps that owner onto the rows that predate the dual-write, so
 * every existing row points at its person. Nothing reads the field yet (that's
 * Phase 2), so this is safe and additive.
 *
 * Resolution for each row, in order:
 *   1. the EmployeeRecord whose `applicationIds` contains the row's applicationId;
 *   2. the record matching the row's applicantEmail;
 *   3. (documents, which carry no email) the record for the application's email.
 * A row that resolves to nothing is left untouched and counted as "unresolved"
 * (should be 0 after 011 — every application is in exactly one record).
 *
 * Idempotent: only rows missing `employeeRecordId` are touched; re-running is a
 * no-op once every row is stamped.
 *
 * Preview (writes nothing):  node migrations/012-backfill-employee-record-links.js --dry-run
 * Apply:                     node migrations/012-backfill-employee-record-links.js
 */

const mongoose = require('mongoose');

function dynamicModel(name, collection) {
  if (mongoose.models[name]) return mongoose.models[name];
  const schema = new mongoose.Schema({}, { strict: false, collection: collection || undefined });
  return mongoose.model(name, schema);
}

function resolveModels(models) {
  return {
    EmployeeRecord: (models && models.EmployeeRecord) || dynamicModel('EmployeeRecord'),
    JobApplication: (models && models.JobApplication) || dynamicModel('JobApplication', 'jobapplications'),
    ApplicationDocument: (models && models.ApplicationDocument) || dynamicModel('ApplicationDocument', 'applicationdocuments'),
    OnboardingInvite: (models && models.OnboardingInvite) || dynamicModel('OnboardingInvite'),
    OnboardingResponse: (models && models.OnboardingResponse) || dynamicModel('OnboardingResponse'),
  };
}

const norm = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : '');
const isUnset = (v) => v === null || v === undefined;

// Build the lookup maps from EmployeeRecord + JobApplication once.
async function buildIndex(models) {
  const { EmployeeRecord, JobApplication } = models;

  const records = await EmployeeRecord.find({}).select('email applicationIds').lean();
  const recordByApp = new Map();   // applicationId(str) → recordId(str)
  const recordByEmail = new Map(); // email(norm)        → recordId(str)
  for (const r of records) {
    const rid = String(r._id);
    if (r.email) recordByEmail.set(norm(r.email), rid);
    for (const appId of Array.isArray(r.applicationIds) ? r.applicationIds : []) {
      recordByApp.set(String(appId), rid);
    }
  }

  // Application → email, for document rows that carry no email of their own.
  const apps = await JobApplication.find({}).select('applicantEmail').lean();
  const appEmail = new Map();
  for (const a of apps) appEmail.set(String(a._id), norm(a.applicantEmail));

  const resolve = ({ applicationId, applicantEmail }) => {
    if (applicationId && recordByApp.has(String(applicationId))) return recordByApp.get(String(applicationId));
    const email = norm(applicantEmail) || (applicationId ? appEmail.get(String(applicationId)) : '');
    if (email && recordByEmail.has(email)) return recordByEmail.get(email);
    return null;
  };

  return { resolve, recordCount: records.length };
}

async function backfillCollection(Model, label, fields, resolve, dryRun) {
  const rows = await Model.find({
    $or: [{ employeeRecordId: null }, { employeeRecordId: { $exists: false } }],
  }).select(fields).lean();

  let updated = 0;
  let unresolved = 0;
  for (const row of rows) {
    if (!isUnset(row.employeeRecordId)) continue; // defensive
    const rid = resolve({ applicationId: row.applicationId, applicantEmail: row.applicantEmail });
    if (!rid) { unresolved += 1; continue; }
    if (!dryRun) {
      await Model.updateOne({ _id: row._id }, { $set: { employeeRecordId: new mongoose.Types.ObjectId(rid) } });
    }
    updated += 1;
  }

  console.log(`[012] ${label}: ${rows.length} missing → ${updated} ${dryRun ? 'would set' : 'set'}, ${unresolved} unresolved${dryRun ? ' (dry-run)' : ''}.`);
  return { label, missing: rows.length, updated, unresolved };
}

async function up(models, opts) {
  const dryRun = !!(opts && opts.dryRun);
  if (dryRun) console.log('[012-backfill-employee-record-links] DRY RUN — no writes will be performed.\n');
  const m = resolveModels(models);

  const { resolve, recordCount } = await buildIndex(m);
  console.log(`[012] indexed ${recordCount} employee record(s).`);

  const results = [];
  results.push(await backfillCollection(m.JobApplication, 'JobApplication', 'employeeRecordId applicantEmail', resolve, dryRun));
  results.push(await backfillCollection(m.OnboardingInvite, 'OnboardingInvite', 'employeeRecordId applicationId applicantEmail', resolve, dryRun));
  results.push(await backfillCollection(m.OnboardingResponse, 'OnboardingResponse', 'employeeRecordId applicationId applicantEmail', resolve, dryRun));
  results.push(await backfillCollection(m.ApplicationDocument, 'ApplicationDocument', 'employeeRecordId applicationId', resolve, dryRun));

  const totalUnresolved = results.reduce((n, r) => n + r.unresolved, 0);
  if (totalUnresolved > 0) {
    console.warn(`[012] ${totalUnresolved} row(s) could not be resolved to a record — run migration 011 first, or investigate orphaned rows.`);
  }
  console.log(`\n[012-backfill-employee-record-links] ${dryRun ? 'DRY RUN complete — nothing changed.' : 'done.'}`);
  return { dryRun, results };
}

module.exports = { up };

if (require.main === module) {
  const { connect, disconnect, buildModels } = require('./lib/db');
  const dryRun = process.argv.includes('--dry-run');
  (async () => {
    await connect();
    try {
      await up(buildModels(), { dryRun });
    } finally {
      await disconnect();
    }
  })().catch((err) => {
    console.error('[012-backfill-employee-record-links] failed:', err);
    process.exit(1);
  });
}
