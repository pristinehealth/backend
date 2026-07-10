/**
 * Migration 003 — purge Perfex's `password` field from stored staff docs.
 *
 * Perfex's /staffs response includes a `password` field (a credential hash the
 * app never uses). Before the sync learned to strip it, `strict:false` schemas
 * (and the schemaless cron.js daemon) persisted it into the `staffs` collection.
 * This removes it from every existing doc. Going forward the sync paths drop it
 * before writing, so this only needs to run once.
 *
 * Idempotent: `$unset` on docs where the field no longer exists is a no-op, and
 * the `{ password: { $exists: true } }` filter means re-running matches nothing.
 *
 * Run standalone:  node migrations/003-unset-staff-password.js
 */

async function up(models) {
  const { Staff } = models;
  const res = await Staff.updateMany(
    { password: { $exists: true } },
    { $unset: { password: '' } }
  );
  const modified = res.modifiedCount ?? res.nModified ?? 0;
  console.log(`[003-unset-staff-password] done — cleared password on ${modified} staff doc(s).`);
  return { modified };
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
    console.error('[003-unset-staff-password] failed:', err);
    process.exit(1);
  });
}
