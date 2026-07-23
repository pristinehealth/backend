/**
 * Migration 010 — allow a candidate to hold MULTIPLE onboarding questionnaires.
 *
 * Onboarding used to be one record per accepted application: OnboardingResponse
 * declared `applicationId` with `unique: true`, which created the unique index
 * `applicationId_1` on the collection. The model now enforces uniqueness on the
 * PAIR (applicationId, onboardingFormId) instead, so a candidate can be given
 * a general screening AND a background check.
 *
 * Mongoose never drops indexes it no longer declares, so on any database that
 * has run the old code the legacy `applicationId_1` unique index is still there
 * and will reject the second questionnaire with E11000. This migration:
 *
 *   1. Drops `applicationId_1` (only when it exists AND is unique — a plain
 *      non-unique index of that name is harmless and is left alone).
 *   2. Backfills `formName`, `order`, and the progress counters
 *      (`answeredCount`, `totalCount`, `requiredCount`) on existing records so
 *      the candidate list shows real progress for in-flight onboardings.
 *
 * Idempotent: re-running finds no legacy index and no records missing fields.
 *
 * Preview (writes nothing):  node migrations/010-onboarding-multi-questionnaire.js --dry-run
 * Apply:                     node migrations/010-onboarding-multi-questionnaire.js
 */

const mongoose = require('mongoose');

// This migration binds the two collections it needs itself rather than relying
// on lib/db's buildModels(), which does not register them. Model names match
// src/models/*.ts so Mongoose derives the same collection names as the app
// ('onboardingresponses', 'onboardingforms'). If a caller does pass them in
// (e.g. a future buildModels that includes them), those win.
function dynamicModel(name) {
  if (mongoose.models[name]) return mongoose.models[name];
  return mongoose.model(name, new mongoose.Schema({}, { strict: false }));
}

function resolveModels(models) {
  return {
    OnboardingResponse: (models && models.OnboardingResponse) || dynamicModel('OnboardingResponse'),
    OnboardingForm: (models && models.OnboardingForm) || dynamicModel('OnboardingForm'),
  };
}

async function dropLegacyUniqueIndex(OnboardingResponse, dryRun) {
  const collection = OnboardingResponse.collection;

  let indexes;
  try {
    indexes = await collection.indexes();
  } catch (err) {
    // NamespaceNotFound — collection doesn't exist yet (fresh database).
    if (err && (err.codeName === 'NamespaceNotFound' || err.code === 26)) {
      console.log('[010-onboarding-multi-questionnaire] onboardingresponses collection does not exist yet — nothing to drop.');
      return false;
    }
    throw err;
  }

  const legacy = indexes.find((ix) => ix.name === 'applicationId_1');
  if (!legacy) {
    console.log('[010-onboarding-multi-questionnaire] legacy applicationId_1 index not present — nothing to drop.');
    return false;
  }
  if (!legacy.unique) {
    console.log('[010-onboarding-multi-questionnaire] applicationId_1 exists but is not unique — leaving it in place.');
    return false;
  }

  // Refuse to drop while duplicates would make the new compound unique index
  // unbuildable — that can only happen if someone inserted around the index.
  const dupes = await OnboardingResponse.aggregate([
    { $group: { _id: { a: '$applicationId', f: '$onboardingFormId' }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]);
  if (dupes.length > 0) {
    throw new Error(
      `${dupes.length} (applicationId, onboardingFormId) pair(s) are duplicated — resolve these before dropping applicationId_1, ` +
      'otherwise the new compound unique index cannot be built.'
    );
  }

  if (dryRun) {
    console.log('[010-onboarding-multi-questionnaire] DRY RUN — would drop legacy UNIQUE index applicationId_1.');
    return true;
  }

  await collection.dropIndex('applicationId_1');
  console.log('[010-onboarding-multi-questionnaire] dropped legacy UNIQUE index applicationId_1.');
  return true;
}

async function backfillRecords(models, dryRun) {
  const { OnboardingResponse, OnboardingForm } = models;

  const responses = await OnboardingResponse.find({})
    .select('applicationId onboardingFormId formName order status answers answeredCount totalCount requiredCount createdAt')
    .sort({ applicationId: 1, createdAt: 1 })
    .lean();

  if (responses.length === 0) {
    console.log('[010-onboarding-multi-questionnaire] no onboarding records to backfill.');
    return { updated: 0, skipped: 0, total: 0 };
  }

  const formIds = Array.from(new Set(responses.map((r) => String(r.onboardingFormId)).filter(Boolean)));
  const forms = await OnboardingForm.find({ _id: { $in: formIds } }).select('name customFields').lean();
  const formById = new Map(forms.map((f) => [String(f._id), f]));

  // `order` is per candidate, assigned in creation order (the sort above).
  const orderByApp = new Map();

  let updated = 0;
  let skipped = 0;

  for (const r of responses) {
    const appKey = String(r.applicationId);
    const nextOrder = orderByApp.get(appKey) || 0;
    orderByApp.set(appKey, nextOrder + 1);

    const form = formById.get(String(r.onboardingFormId));
    const fields = Array.isArray(form && form.customFields) ? form.customFields : [];
    const fieldNames = new Set(fields.map((f) => f && f.name));

    // `answers` is a Map in Mongoose but a plain object once .lean()'d.
    const answerKeys = r.answers && typeof r.answers === 'object' ? Object.keys(r.answers) : [];
    const answeredCount = answerKeys.filter((k) => fieldNames.has(k)).length;
    const totalCount = fields.length;
    const requiredCount = fields.filter((f) => f && f.required).length;
    const formName = (form && form.name) || r.formName || '';

    const alreadyCurrent =
      r.formName === formName &&
      r.order === nextOrder &&
      r.answeredCount === answeredCount &&
      r.totalCount === totalCount &&
      r.requiredCount === requiredCount;

    if (alreadyCurrent) {
      skipped += 1;
      continue;
    }

    if (!dryRun) {
      await OnboardingResponse.updateOne(
        { _id: r._id },
        { $set: { formName, order: nextOrder, answeredCount, totalCount, requiredCount } }
      );
    }
    updated += 1;
    console.log(
      `[010-onboarding-multi-questionnaire] ${dryRun ? 'would backfill' : 'backfilled'} ${r._id} — ` +
      `"${formName || 'unknown questionnaire'}" order=${nextOrder}, ${answeredCount}/${totalCount} answered ` +
      `(${requiredCount} required)`
    );
  }

  console.log(
    `[010-onboarding-multi-questionnaire] backfill ${dryRun ? 'preview' : 'done'} — ${updated} ${dryRun ? 'would be updated' : 'updated'}, ` +
    `${skipped} already current, ${responses.length} total.`
  );
  return { updated, skipped, total: responses.length };
}

// `opts.dryRun` reports what would change and writes nothing.
async function up(models, opts) {
  const dryRun = !!(opts && opts.dryRun);
  if (dryRun) console.log('[010-onboarding-multi-questionnaire] DRY RUN — no writes will be performed.\n');
  const resolved = resolveModels(models);
  const droppedIndex = await dropLegacyUniqueIndex(resolved.OnboardingResponse, dryRun);
  const backfill = await backfillRecords(resolved, dryRun);
  if (dryRun) console.log('\n[010-onboarding-multi-questionnaire] DRY RUN complete — nothing was changed.');
  return { droppedIndex, dryRun, ...backfill };
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
    console.error('[010-onboarding-multi-questionnaire] failed:', err);
    process.exit(1);
  });
}
