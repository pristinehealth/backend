/**
 * Migration 014 — assign human-friendly sequential reference numbers to existing
 * job positions.
 *
 * New jobs get a `refNumber` at creation (via the "jobRef" counter), displayed
 * as e.g. "PHS-0007" on the public job page and admin list. Jobs created before
 * that change have no number; this backfills them in `createdAt` order and sets
 * the `jobRef` counter so future creations continue from the max.
 *
 * Safe/idempotent: only jobs missing `refNumber` are assigned, continuing after
 * the current max, so re-running is a no-op and never reassigns/collides.
 *
 * Preview (writes nothing):  node migrations/014-backfill-job-ref-numbers.js --dry-run
 * Apply:                     node migrations/014-backfill-job-ref-numbers.js
 */

const mongoose = require('mongoose');

function dynamicModel(name, collection) {
  if (mongoose.models[name]) return mongoose.models[name];
  const schema = new mongoose.Schema({}, { strict: false, collection });
  return mongoose.model(name, schema);
}

// Counter uses a STRING _id (the sequence name, e.g. "jobRef"), so it needs its
// own schema — the schemaless helper defaults _id to ObjectId and can't query
// by "jobRef".
function counterModel() {
  if (mongoose.models.Counter) return mongoose.models.Counter;
  const schema = new mongoose.Schema(
    { _id: String, seq: { type: Number, default: 0 } },
    { collection: 'counters', versionKey: false },
  );
  return mongoose.model('Counter', schema);
}

async function up(_models, opts) {
  const dryRun = !!(opts && opts.dryRun);
  const JobPosition = dynamicModel('JobPosition', 'jobpositions');
  const Counter = counterModel();

  // Current max among jobs that already have a number.
  const withNumber = await JobPosition.find({ refNumber: { $type: 'number' } })
    .sort({ refNumber: -1 }).limit(1).lean();
  let max = withNumber.length ? Number(withNumber[0].refNumber) : 0;
  console.log(`[014] current max refNumber = ${max}`);

  // Jobs missing a number, oldest first, so numbering follows creation order.
  const pending = await JobPosition.find({ refNumber: { $exists: false } })
    .sort({ createdAt: 1, _id: 1 }).select('_id title createdAt').lean();
  console.log(`[014] ${pending.length} job(s) need a refNumber.`);

  for (const job of pending) {
    max += 1;
    if (dryRun) {
      console.log(`[014] would set ${job._id} ("${job.title}") -> PHS-${String(max).padStart(4, '0')}`);
    } else {
      await JobPosition.updateOne({ _id: job._id }, { $set: { refNumber: max } });
      console.log(`[014] ${job._id} -> PHS-${String(max).padStart(4, '0')}`);
    }
  }

  // Advance the counter so new jobs continue after the max.
  const counter = await Counter.findById('jobRef').lean();
  const counterSeq = counter ? Number(counter.seq) : 0;
  const target = Math.max(counterSeq, max);
  if (target !== counterSeq) {
    if (dryRun) {
      console.log(`[014] would set counter jobRef.seq ${counterSeq} -> ${target}`);
    } else {
      await Counter.updateOne({ _id: 'jobRef' }, { $set: { seq: target } }, { upsert: true });
      console.log(`[014] counter jobRef.seq -> ${target}`);
    }
  } else {
    console.log(`[014] counter jobRef.seq already ${counterSeq} — no change.`);
  }

  console.log(`\n[014-backfill-job-ref-numbers] ${dryRun ? 'DRY RUN complete — nothing changed.' : 'done.'}`);
  return { dryRun, assigned: pending.length, max };
}

module.exports = { up };

if (require.main === module) {
  const { connect, disconnect, buildModels } = require('./lib/db');
  const dryRun = process.argv.includes('--dry-run');
  (async () => {
    await connect();
    try {
      await up(buildModels ? buildModels() : {}, { dryRun });
    } finally {
      await disconnect();
    }
  })().catch((err) => {
    console.error('[014-backfill-job-ref-numbers] failed:', err);
    process.exit(1);
  });
}
