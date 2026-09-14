/**
 * Migration 013 — move onboarding uniqueness from the application to the person
 * (Phase 3). Enables onboarding a staff member with NO application: with
 * applicationId now optional, the old application-keyed unique indexes would
 * reject multiple staff rows sharing a null, so uniqueness moves to
 * employeeRecordId (partial, so nulls never collide).
 *
 * Changes:
 *   OnboardingInvite
 *     - drop legacy `applicationId_1` UNIQUE (one-invite-per-application inline)
 *     - build `applicationId_unique_partial` (unique only where applicationId is set)
 *   OnboardingResponse
 *     - verify no duplicate (employeeRecordId, onboardingFormId) pairs exist
 *     - drop legacy `applicationId_onboardingFormId_unique`
 *     - build `employeeRecordId_onboardingFormId_unique` (partial) + (employeeRecordId, order)
 *
 * Run AFTER 012 has backfilled employeeRecordId (the new unique needs it set).
 * Idempotent: re-running finds the new indexes present and the legacy ones gone.
 *
 * Preview (writes nothing):  node migrations/013-employee-record-index-cutover.js --dry-run
 * Apply:                     node migrations/013-employee-record-index-cutover.js
 */

const mongoose = require('mongoose');

function dynamicModel(name, collection) {
  if (mongoose.models[name]) return mongoose.models[name];
  const schema = new mongoose.Schema({}, { strict: false, collection: collection || undefined });
  return mongoose.model(name, schema);
}

function resolveModels(models) {
  return {
    OnboardingInvite: (models && models.OnboardingInvite) || dynamicModel('OnboardingInvite'),
    OnboardingResponse: (models && models.OnboardingResponse) || dynamicModel('OnboardingResponse'),
  };
}

async function listIndexes(collection) {
  try {
    return await collection.indexes();
  } catch (err) {
    if (err && (err.codeName === 'NamespaceNotFound' || err.code === 26)) return null; // fresh DB
    throw err;
  }
}

async function dropIndexByName(collection, name, dryRun) {
  const indexes = await listIndexes(collection);
  if (!indexes) { console.log(`[013] ${collection.collectionName}: collection does not exist yet — skip drop ${name}.`); return false; }
  const hit = indexes.find((ix) => ix.name === name);
  if (!hit) { console.log(`[013] ${collection.collectionName}: index ${name} not present — nothing to drop.`); return false; }
  if (dryRun) { console.log(`[013] ${collection.collectionName}: would drop index ${name}.`); return true; }
  await collection.dropIndex(name);
  console.log(`[013] ${collection.collectionName}: dropped index ${name}.`);
  return true;
}

async function createIndexSafe(collection, keys, options, dryRun) {
  if (dryRun) { console.log(`[013] ${collection.collectionName}: would create index ${options.name}.`); return; }
  await collection.createIndex(keys, options);
  console.log(`[013] ${collection.collectionName}: ensured index ${options.name}.`);
}

async function up(models, opts) {
  const dryRun = !!(opts && opts.dryRun);
  if (dryRun) console.log('[013-employee-record-index-cutover] DRY RUN — no writes will be performed.\n');
  const { OnboardingInvite, OnboardingResponse } = resolveModels(models);

  // ── OnboardingInvite ──────────────────────────────────────────────────────
  await dropIndexByName(OnboardingInvite.collection, 'applicationId_1', dryRun);
  await createIndexSafe(
    OnboardingInvite.collection,
    { applicationId: 1 },
    { unique: true, name: 'applicationId_unique_partial', partialFilterExpression: { applicationId: { $type: 'objectId' } } },
    dryRun
  );

  // ── OnboardingResponse ────────────────────────────────────────────────────
  // Guard: the new (employeeRecordId, onboardingFormId) unique can't build if a
  // person somehow holds the same questionnaire twice (e.g. assigned via two
  // applications). Surface those instead of failing the index build.
  const dupes = await OnboardingResponse.aggregate([
    { $match: { employeeRecordId: { $ne: null } } },
    { $group: { _id: { e: '$employeeRecordId', f: '$onboardingFormId' }, n: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { n: { $gt: 1 } } },
  ]);
  if (dupes.length > 0) {
    dupes.slice(0, 25).forEach((d) => console.error(`[013] duplicate: employeeRecordId=${d._id.e} onboardingFormId=${d._id.f} → ${d.ids.length} rows (${d.ids.join(', ')})`));
    throw new Error(`${dupes.length} (employeeRecordId, onboardingFormId) pair(s) are duplicated — resolve before building the unique index.`);
  }

  await dropIndexByName(OnboardingResponse.collection, 'applicationId_onboardingFormId_unique', dryRun);
  await createIndexSafe(
    OnboardingResponse.collection,
    { employeeRecordId: 1, onboardingFormId: 1 },
    { unique: true, name: 'employeeRecordId_onboardingFormId_unique', partialFilterExpression: { employeeRecordId: { $type: 'objectId' } } },
    dryRun
  );
  await createIndexSafe(OnboardingResponse.collection, { employeeRecordId: 1, order: 1 }, { name: 'employeeRecordId_1_order_1' }, dryRun);

  console.log(`\n[013-employee-record-index-cutover] ${dryRun ? 'DRY RUN complete — nothing changed.' : 'done.'}`);
  return { dryRun };
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
    console.error('[013-employee-record-index-cutover] failed:', err);
    process.exit(1);
  });
}
