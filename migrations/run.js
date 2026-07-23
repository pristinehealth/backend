/**
 * Compliance migration runner. Runs all migration steps in order against a
 * single Mongo connection. Every step is idempotent, so this is safe to re-run.
 *
 *   npm run migrate:compliance
 *   # or: node migrations/run.js
 */
const { connect, disconnect, buildModels } = require('./lib/db');

const STEPS = [
  require('./001-seed-compliance-requirements'),
  require('./002-backfill-staff-compliance'),
  require('./003-unset-staff-password'),
  require('./005-compliance-evidence-reference'),
  require('./006-materialize-application-evidence'),
  require('./007-purge-applies-to-roles'),
  require('./008-purge-position-category'),
  require('./010-onboarding-multi-questionnaire'),
];

async function main() {
  await connect();
  const models = buildModels();
  try {
    for (const step of STEPS) {
      await step.up(models);
    }
    console.log('[migrate:compliance] all steps completed');
  } finally {
    await disconnect();
  }
}

main().catch((err) => {
  console.error('[migrate:compliance] failed:', err);
  process.exit(1);
});
