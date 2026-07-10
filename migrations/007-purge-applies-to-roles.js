/**
 * Migration 007 — purge the retired `appliesToRoles` targeting field.
 *
 * Compliance requirement targeting is now positions-only (`appliesToAll` +
 * `appliesToPositions`). The category/role field has been removed from the model
 * and all logic. This drops the now-unused `appliesToRoles` from every stored
 * requirement so the collection matches the schema.
 *
 * Idempotent: re-running finds nothing left to unset.
 *
 * Run standalone:  node migrations/007-purge-applies-to-roles.js
 */

async function up(models) {
  const { ComplianceRequirement } = models;

  const res = await ComplianceRequirement.updateMany(
    { appliesToRoles: { $exists: true } },
    { $unset: { appliesToRoles: '' } }
  );
  const unset = res.modifiedCount ?? res.nModified ?? 0;

  console.log(`[007-purge-applies-to-roles] unset appliesToRoles on ${unset} requirement(s).`);
  return { unset };
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
    console.error('[007-purge-applies-to-roles] failed:', err);
    process.exit(1);
  });
}
