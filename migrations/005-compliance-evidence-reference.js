/**
 * Migration 005 — move ComplianceEvidence metadata → typed fields.
 *
 * `metadata.value` (free-form Mixed) was promoted to the typed `reference` field,
 * and `label` was added for an evidence name. Pre-prod, no backward compat: copy
 * any existing `metadata.value` into `reference`, then drop the `metadata` field
 * from every evidence row.
 *
 * Idempotent: re-running finds no `metadata` to move and unsets nothing.
 *
 * Run standalone:  node migrations/005-compliance-evidence-reference.js
 */

async function up(models) {
  const { ComplianceEvidence } = models;

  // 1. Copy metadata.value → reference where present and reference is empty.
  const withValue = await ComplianceEvidence.find({ 'metadata.value': { $exists: true } })
    .select('_id metadata reference')
    .lean();
  let copied = 0;
  for (const ev of withValue) {
    const val = ev.metadata && ev.metadata.value != null ? String(ev.metadata.value).trim() : '';
    if (val && !ev.reference) {
      await ComplianceEvidence.updateOne({ _id: ev._id }, { $set: { reference: val } });
      copied++;
    }
  }

  // 2. Drop the now-unused metadata field from all evidence rows.
  const res = await ComplianceEvidence.updateMany(
    { metadata: { $exists: true } },
    { $unset: { metadata: '' } }
  );
  const unset = res.modifiedCount ?? res.nModified ?? 0;

  console.log(`[005-compliance-evidence-reference] copied ${copied} value(s) → reference; unset metadata on ${unset} row(s).`);
  return { copied, unset };
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
    console.error('[005-compliance-evidence-reference] failed:', err);
    process.exit(1);
  });
}
