/**
 * Migration 009 — update the `employment_type` question on existing application
 * forms to the new "Preferred Employment Type" label + W-2/1099 classification
 * options.
 *
 * New forms already get these via DEFAULT_FORM_FIELDS in the form builder; this
 * brings already-saved ApplicationForm documents in line.
 *
 * Scope: only the `employment_type` custom field is touched, and only when its
 * label or options differ from the target — so it does NOT clobber a form whose
 * options an admin has already customized to something else that happens to
 * include these values, and re-running finds nothing left to change (idempotent).
 *
 * Run standalone:  node migrations/009-employment-type-options.js
 */

const NEW_LABEL = 'Preferred Employment Type';
const NEW_OPTIONS = [
  'Full-Time W-2 – Regular employees working a standard weekly schedule and eligible for applicable benefits.',
  'Part-Time W-2 – Employees working fewer hours than full-time, often on a recurring schedule.',
  'Per Diem / PRN W-2 – Employees who accept shifts as needed without guaranteed weekly hours.',
  'Temporary W-2 – Employees hired for a limited assignment, seasonal need, or defined period.',
  'Contract Assignment W-2 – Employees assigned to a specific facility, client, project, or contract for a set duration.',
  'Travel Contract W-2 – Healthcare professionals working temporary assignments outside their usual service area, potentially with travel or housing stipends.',
  'Temp-to-Hire – Workers initially placed on a temporary basis with the possibility of permanent employment.',
  'Independent Contractor / 1099 – Self-employed professionals engaged for defined services when the role legally qualifies for contractor classification.',
  'On-Call – Staff available to cover urgent, short-notice, weekend, overnight, or call-out shifts.',
  'Internship or Training Position – Individuals completing supervised educational or professional development assignments.',
];

function sameOptions(a) {
  return Array.isArray(a)
    && a.length === NEW_OPTIONS.length
    && a.every((v, i) => v === NEW_OPTIONS[i]);
}

async function up(models) {
  const { ApplicationForm } = models;

  const forms = await ApplicationForm.find({ 'customFields.name': 'employment_type' })
    .select('name customFields')
    .lean();

  let updated = 0;
  let skipped = 0;

  for (const form of forms) {
    const field = (form.customFields || []).find((f) => f && f.name === 'employment_type');
    if (!field) continue;

    if (field.label === NEW_LABEL && sameOptions(field.options)) {
      skipped += 1;
      continue;
    }

    await ApplicationForm.updateOne(
      { _id: form._id, 'customFields.name': 'employment_type' },
      {
        $set: {
          'customFields.$[elem].label': NEW_LABEL,
          'customFields.$[elem].options': NEW_OPTIONS,
        },
      },
      { arrayFilters: [{ 'elem.name': 'employment_type' }] }
    );

    updated += 1;
    console.log(
      `[009-employment-type-options] updated form "${form.name || form._id}" ` +
      `(was label="${field.label}", ${Array.isArray(field.options) ? field.options.length : 0} option(s))`
    );
  }

  console.log(
    `[009-employment-type-options] done — ${updated} updated, ${skipped} already current, ` +
    `${forms.length} total with an employment_type field.`
  );
  return { updated, skipped, total: forms.length };
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
    console.error('[009-employment-type-options] failed:', err);
    process.exit(1);
  });
}
