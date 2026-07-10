/**
 * Migration 008 — purge the retired `positions` (position category) field.
 *
 * A job posting's free-text "position category" only ever fed the old
 * category-based compliance targeting, which has been removed (see migration
 * 007). Requirement targeting is now positions-only (`appliesToAll` +
 * `appliesToPositions` of specific posting ids), so `JobPosition.positions` is
 * dead. This drops it from every stored posting.
 *
 * Idempotent: re-running finds nothing left to unset.
 *
 * Run standalone:  node migrations/008-purge-position-category.js
 */

async function up(models) {
  const { JobPosition } = models;

  const res = await JobPosition.updateMany(
    { positions: { $exists: true } },
    { $unset: { positions: '' } }
  );
  const unset = res.modifiedCount ?? res.nModified ?? 0;

  console.log(`[008-purge-position-category] unset positions on ${unset} job position(s).`);
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
    console.error('[008-purge-position-category] failed:', err);
    process.exit(1);
  });
}
