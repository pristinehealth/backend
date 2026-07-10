/**
 * One-off cleanup — delete specific ApplicationDocument records and their
 * Cloudinary files. NOT a numbered migration and NOT in run.js; run by hand.
 *
 * Used to remove test/unwanted application uploads that surface on the staff
 * page via the StaffDocument fallback (source: 'application'). Deletes, per
 * matched ApplicationDocument:
 *   1. its Cloudinary asset (only if no ComplianceEvidence / StaffDocument /
 *      other ApplicationDocument still references the same fileUrl), then
 *   2. any UploadAsset row for that file, then
 *   3. the ApplicationDocument itself.
 *
 * DRY-RUN by default. Pass --apply to actually delete.
 *
 *   node migrations/cleanup-application-documents.js \
 *     --email=franklinokomba@gmail.com --types=first_aid_cpr_bls,hepatitis_ab
 *   node migrations/cleanup-application-documents.js \
 *     --email=franklinokomba@gmail.com --types=first_aid_cpr_bls,hepatitis_ab --apply
 */
require('dotenv').config({ path: '.env' });
const { v2: cloudinary } = require('cloudinary');
const { connect, disconnect, mongoose } = require('./lib/db');

cloudinary.config({ secure: true }); // reads CLOUDINARY_URL

function arg(name, def) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
}
const APPLY = process.argv.includes('--apply');
const EMAIL = arg('email', '');
const TYPES = arg('types', '').split(',').map((s) => s.trim()).filter(Boolean);
const IDS = arg('ids', '').split(',').map((s) => s.trim()).filter(Boolean);

// Mirror of src/lib/cloudinary.ts publicIdFromUrl.
function publicIdFromUrl(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes('cloudinary')) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    const idx = parts.findIndex((p) => p === 'upload' || p === 'authenticated' || p === 'private');
    if (idx === -1) return null;
    let rest = parts.slice(idx + 1);
    if (rest[0] && /^v\d+$/.test(rest[0])) rest = rest.slice(1);
    if (!rest.length) return null;
    rest[rest.length - 1] = rest[rest.length - 1].replace(/\.[^.]+$/, '');
    return rest.join('/');
  } catch {
    return null;
  }
}
async function deleteCloudinaryAsset(publicId) {
  for (const resource_type of ['image', 'raw', 'video']) {
    try {
      const r = await cloudinary.uploader.destroy(publicId, { resource_type });
      if (r.result === 'ok' || r.result === 'not found') return r.result;
    } catch {
      /* try next */
    }
  }
  return 'failed';
}

function model(name, collection) {
  if (mongoose.models[name]) return mongoose.models[name];
  return mongoose.model(name, new mongoose.Schema({}, { strict: false, collection }));
}

async function main() {
  if (!EMAIL && !IDS.length) {
    console.error('Provide --email=<addr> (optionally --types=a,b) or --ids=id1,id2');
    process.exit(1);
  }
  await connect();
  const ApplicationDocument = model('ApplicationDocument', 'applicationdocuments');
  const JobApplication = model('JobApplication', 'jobapplications');
  const StaffDocument = model('StaffDocument', 'staffdocuments');
  const ComplianceEvidence = model('ComplianceEvidence', 'complianceevidences');
  const UploadAsset = model('UploadAsset', 'uploadassets');

  // Resolve the target ApplicationDocuments.
  let query;
  if (IDS.length) {
    query = { _id: { $in: IDS.map((id) => new mongoose.Types.ObjectId(id)) } };
  } else {
    const app = await JobApplication.findOne({
      applicantEmail: { $regex: new RegExp(`^${EMAIL}$`, 'i') },
    })
      .sort({ createdAt: -1 })
      .select('_id applicantEmail')
      .lean();
    if (!app) {
      console.log(`[cleanup] No application found for ${EMAIL}. Nothing to do.`);
      await disconnect();
      return;
    }
    query = { applicationId: app._id };
    if (TYPES.length) query.documentType = { $in: TYPES };
  }

  const docs = await ApplicationDocument.find(query).lean();
  console.log(`[cleanup] ${APPLY ? 'APPLY' : 'DRY-RUN'} — matched ${docs.length} ApplicationDocument(s).`);
  if (!docs.length) {
    await disconnect();
    return;
  }

  let deletedDocs = 0;
  let deletedFiles = 0;
  for (const d of docs) {
    const url = d.fileUrl || '';
    // Is the file shared with anything we must keep?
    let shared = 0;
    if (url) {
      const [ev, sd, otherApp] = await Promise.all([
        ComplianceEvidence.countDocuments({ fileUrl: url }),
        StaffDocument.countDocuments({ fileUrl: url }),
        ApplicationDocument.countDocuments({ fileUrl: url, _id: { $ne: d._id } }),
      ]);
      shared = ev + sd + otherApp;
    }
    const pid = url ? publicIdFromUrl(url) : null;
    console.log(
      `  - ${d.documentType} (${d._id}) file=${d.fileName || '—'} ` +
        `${url ? `shared_refs=${shared}` : '(no file)'} ${pid ? `publicId=${pid}` : ''}`
    );

    if (!APPLY) continue;

    if (url && shared === 0 && pid) {
      const res = await deleteCloudinaryAsset(pid);
      if (res === 'ok') deletedFiles++;
      console.log(`      cloudinary destroy -> ${res}`);
      await UploadAsset.deleteMany({ publicId: pid });
    } else if (shared > 0) {
      console.log('      file KEPT — still referenced elsewhere; deleting DB record only.');
    }
    await ApplicationDocument.deleteOne({ _id: d._id });
    deletedDocs++;
  }

  console.log(
    APPLY
      ? `[cleanup] done — deleted ${deletedDocs} ApplicationDocument(s), ${deletedFiles} Cloudinary file(s).`
      : '[cleanup] dry-run: nothing deleted. Re-run with --apply to delete.'
  );
  await disconnect();
}

main().catch(async (err) => {
  console.error('[cleanup] failed:', err);
  try { await disconnect(); } catch { /* noop */ }
  process.exit(1);
});
