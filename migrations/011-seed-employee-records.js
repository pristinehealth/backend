/**
 * Migration 011 — seed the person-centric EmployeeRecord hub (Phase 0).
 *
 * Creates one EmployeeRecord per human, keyed by EMAIL and/or the Perfex
 * `staffId`, gathering their applications. This is additive and read-only for
 * every existing collection — no application, staff, onboarding, or document
 * row is modified. Nothing in the app reads EmployeeRecord yet (that begins in
 * Phase 1/2). See docs/employee-record-plan.md.
 *
 * Identity policy: EMAIL-PRIMARY with MANUAL merge.
 *   Pass A — group JobApplications by normalized applicantEmail → one email-keyed
 *            record each, with all their application ids.
 *   Pass B — for each Staff, attach its `staffId` to the right record:
 *            1. a record that already has this staffId (idempotent);
 *            2. the record whose applications were accepted into this staffId
 *               (JobApplication.acceptedStaffId — a definitive link, not a guess);
 *            3. the record matching the staff's exact email, if it has no staffId
 *               yet (exact-email auto-link);
 *            4. otherwise a new staffId-only record (existing staff who never
 *               applied — the case that motivated all of this).
 *   Anything ambiguous (email already bound to a DIFFERENT staffId) is NOT
 *   auto-merged — it's logged for a human to resolve via the future merge action.
 *
 * After seeding (clean, deduped data) it creates the unique partial indexes so
 * production gets them deterministically regardless of Mongoose autoIndex.
 *
 * Idempotent: re-running finds the records already present and converges.
 *
 * Preview (writes nothing):  node migrations/011-seed-employee-records.js --dry-run
 * Apply:                     node migrations/011-seed-employee-records.js
 */

const mongoose = require('mongoose');

// Bind EmployeeRecord with NO explicit collection so Mongoose derives the same
// name the Next.js app will ('employeerecords'). Existing collections come from
// buildModels() with their explicit app names.
function dynamicModel(name, collection) {
  if (mongoose.models[name]) return mongoose.models[name];
  const schema = new mongoose.Schema({}, { strict: false, collection: collection || undefined });
  return mongoose.model(name, schema);
}

function resolveModels(models) {
  return {
    EmployeeRecord: (models && models.EmployeeRecord) || dynamicModel('EmployeeRecord'),
    JobApplication: (models && models.JobApplication) || dynamicModel('JobApplication', 'jobapplications'),
    Staff: (models && models.Staff) || dynamicModel('Staff', 'staffs'),
  };
}

const norm = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : '');
const staffName = (s) =>
  (s && (s.full_name || [s.firstname, s.lastname].filter(Boolean).join(' ').trim())) || '';

// ── Pass A: applications → email-keyed records ──────────────────────────────
async function seedFromApplications(models, dryRun) {
  const { EmployeeRecord, JobApplication } = models;

  const apps = await JobApplication.find({})
    .select('applicantEmail applicantName status acceptedStaffId createdAt')
    .sort({ createdAt: 1 })
    .lean();

  // Group by normalized email; also map acceptedStaffId → email (definitive link).
  const groups = new Map(); // email → { appIds:[], name, latestAt }
  const acceptedStaffIdToEmail = new Map();

  for (const a of apps) {
    const email = norm(a.applicantEmail);
    if (!email) continue; // email is required on applications; skip defensively.
    let g = groups.get(email);
    if (!g) { g = { appIds: [], name: '', latestAt: null }; groups.set(email, g); }
    g.appIds.push(a._id);
    const at = a.createdAt ? new Date(a.createdAt) : null;
    if (a.applicantName && (!g.latestAt || (at && at >= g.latestAt))) {
      g.name = a.applicantName; g.latestAt = at || g.latestAt;
    }
    const asid = typeof a.acceptedStaffId === 'string' && a.acceptedStaffId.trim() ? a.acceptedStaffId.trim() : '';
    if (asid) {
      if (acceptedStaffIdToEmail.has(asid) && acceptedStaffIdToEmail.get(asid) !== email) {
        console.warn(`[011] staffId ${asid} is referenced by two emails (${acceptedStaffIdToEmail.get(asid)}, ${email}) — using the first; review manually.`);
      } else {
        acceptedStaffIdToEmail.set(asid, email);
      }
    }
  }

  let created = 0;
  let updated = 0;
  for (const [email, g] of groups) {
    const existing = await EmployeeRecord.findOne({ email }).lean();
    if (!existing) {
      if (!dryRun) {
        await EmployeeRecord.create({
          email,
          staffId: null,
          name: g.name || '',
          applicationIds: g.appIds,
          status: 'applicant',
          primaryEmailSource: 'application',
        });
      }
      created += 1;
    } else {
      // Ensure every application id is present (idempotent top-up).
      if (!dryRun) {
        await EmployeeRecord.updateOne(
          { _id: existing._id },
          {
            $addToSet: { applicationIds: { $each: g.appIds } },
            $set: {
              name: existing.name || g.name || '',
              primaryEmailSource: existing.primaryEmailSource || 'application',
            },
          }
        );
      }
      updated += 1;
    }
  }

  console.log(`[011] applications: ${groups.size} distinct email(s) → ${created} created, ${updated} updated${dryRun ? ' (dry-run)' : ''}.`);
  return { acceptedStaffIdToEmail, emailRecordCount: groups.size };
}

// ── Pass B: staff → attach staffId to the right record ──────────────────────
async function seedFromStaff(models, acceptedStaffIdToEmail, dryRun) {
  const { EmployeeRecord, Staff } = models;

  const staff = await Staff.find({}).select('staffid email firstname lastname full_name').lean();

  let linked = 0;      // staffId attached to an existing (email) record
  let created = 0;     // new staffId-only record (existing staff, no application)
  let already = 0;     // idempotent — record already carries this staffId
  let conflicts = 0;   // email already bound to a different staffId — manual merge

  for (const s of staff) {
    const staffId = typeof s.staffid === 'string' ? s.staffid.trim() : String(s.staffid || '').trim();
    if (!staffId) continue;
    const sEmail = norm(s.email);
    const name = staffName(s);

    // 1. Already carried somewhere → idempotent.
    const byStaff = await EmployeeRecord.findOne({ staffId }).lean();
    if (byStaff) {
      if (!dryRun && !byStaff.name && name) await EmployeeRecord.updateOne({ _id: byStaff._id }, { $set: { name, status: 'staff' } });
      already += 1;
      continue;
    }

    // 2. Definitive link via acceptedStaffId, then 3. exact-email auto-link.
    const bridgeEmail = acceptedStaffIdToEmail.get(staffId) || '';
    const targetEmail = bridgeEmail || sEmail;
    let target = targetEmail ? await EmployeeRecord.findOne({ email: targetEmail }).lean() : null;

    if (target && (!target.staffId || target.staffId === staffId)) {
      if (!dryRun) {
        await EmployeeRecord.updateOne(
          { _id: target._id },
          { $set: { staffId, status: 'staff', name: target.name || name } }
        );
      }
      linked += 1;
      continue;
    }

    if (target && target.staffId && target.staffId !== staffId) {
      // Same email already claimed by a different staffId — do not guess.
      console.warn(`[011] CONFLICT: email ${targetEmail} is bound to staffId ${target.staffId}, but staff ${staffId} shares it. Creating a staffId-only record; resolve via manual merge.`);
      conflicts += 1;
    }

    // 4. New staffId-only record. Drop the email if it's already taken to keep
    //    the unique index clean (the person then needs a manual merge).
    let emailForNew = sEmail || null;
    if (emailForNew) {
      const emailTaken = await EmployeeRecord.findOne({ email: emailForNew }).select('_id').lean();
      if (emailTaken) emailForNew = null;
    }
    if (!dryRun) {
      await EmployeeRecord.create({
        email: emailForNew,
        staffId,
        name,
        applicationIds: [],
        status: 'staff',
        primaryEmailSource: emailForNew ? 'staff' : null,
      });
    }
    created += 1;
  }

  console.log(`[011] staff: ${staff.length} total → ${linked} linked, ${created} new staffId-only, ${already} already linked, ${conflicts} conflict(s)${dryRun ? ' (dry-run)' : ''}.`);
  return { linked, created, already, conflicts };
}

// ── Indexes: create the unique partial indexes on clean, deduped data ───────
async function ensureIndexes(EmployeeRecord, dryRun) {
  if (dryRun) {
    console.log('[011] DRY RUN — would ensure unique partial indexes email_unique, staffId_unique and applicationIds_1.');
    return;
  }
  const c = EmployeeRecord.collection;
  await c.createIndex({ email: 1 }, { unique: true, name: 'email_unique', partialFilterExpression: { email: { $type: 'string' } } });
  await c.createIndex({ staffId: 1 }, { unique: true, name: 'staffId_unique', partialFilterExpression: { staffId: { $type: 'string' } } });
  await c.createIndex({ applicationIds: 1 }, { name: 'applicationIds_1' });
  console.log('[011] ensured indexes: email_unique, staffId_unique, applicationIds_1.');
}

// `opts.dryRun` reports what would change and writes nothing.
async function up(models, opts) {
  const dryRun = !!(opts && opts.dryRun);
  if (dryRun) console.log('[011-seed-employee-records] DRY RUN — no writes will be performed.\n');
  const resolved = resolveModels(models);

  const { acceptedStaffIdToEmail } = await seedFromApplications(resolved, dryRun);
  const staffResult = await seedFromStaff(resolved, acceptedStaffIdToEmail, dryRun);
  await ensureIndexes(resolved.EmployeeRecord, dryRun);

  const total = dryRun ? null : await resolved.EmployeeRecord.estimatedDocumentCount();
  console.log(`\n[011-seed-employee-records] ${dryRun ? 'DRY RUN complete — nothing changed.' : `done — ${total} employee record(s) total.`}`);
  return { dryRun, ...staffResult };
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
    console.error('[011-seed-employee-records] failed:', err);
    process.exit(1);
  });
}
