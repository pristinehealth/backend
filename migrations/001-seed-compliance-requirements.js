/**
 * Migration 001 — seed compliance requirements.
 *
 * Idempotent: upserts one ComplianceRequirement per definition, keyed on `key`.
 * Re-running updates definitions in place (never duplicates).
 *
 * Run standalone:  node migrations/001-seed-compliance-requirements.js
 * Or via runner:   npm run migrate:compliance
 */
const REQUIREMENTS = require('./data/complianceRequirements');

async function up(models) {
  const { ComplianceRequirement } = models;
  const now = new Date();
  let inserted = 0;
  let updated = 0;

  for (const req of REQUIREMENTS) {
    const res = await ComplianceRequirement.updateOne(
      { key: req.key },
      {
        $set: {
          label: req.label,
          description: req.description,
          evidenceMode: req.evidenceMode,
          requiresExpiry: req.requiresExpiry,
          expiryCheckDays: req.expiryCheckDays,
          isMandatory: req.isMandatory,
          active: req.active,
          updatedAt: now,
        },
        $setOnInsert: { key: req.key, createdAt: now },
      },
      { upsert: true }
    );
    if (res.upsertedCount) inserted += 1;
    else if (res.modifiedCount) updated += 1;
  }

  console.log(
    `[001-seed] requirements: ${REQUIREMENTS.length} total, ${inserted} inserted, ${updated} updated`
  );
  return { inserted, updated, total: REQUIREMENTS.length };
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
    console.error('[001-seed] failed:', err);
    process.exit(1);
  });
}
