/**
 * Shared connection + model helpers for compliance migrations.
 *
 * Follows the same pattern as cron.js: plain CommonJS, dotenv, and schemaless
 * ("strict: false") dynamic Mongoose models so we don't have to compile the
 * Next.js/TypeScript model files to run a migration.
 *
 * IMPORTANT — collection names:
 *  - Existing collections are bound with an explicit `collection` name so we
 *    read exactly what the app writes.
 *  - The NEW compliance collections are bound with NO explicit collection and
 *    the SAME model name as their `src/models/*.ts` counterparts, so Mongoose
 *    derives an identical collection name to the running app.
 */
const path = require('path');
// Load the backend-root .env no matter which directory the migration is invoked
// from (e.g. from inside migrations/), so MONGO_URI is always found.
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGO_URI || '';
if (!MONGODB_URI) {
  console.error('[migration] Missing required environment variable MONGO_URI');
  process.exit(1);
}

async function connect() {
  if (mongoose.connection.readyState === 1) return mongoose;
  await mongoose.connect(MONGODB_URI, { bufferCommands: false });
  console.log('[migration] MongoDB connected');
  return mongoose;
}

async function disconnect() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log('[migration] MongoDB disconnected');
  }
}

function dynamicModel(name, collection) {
  if (mongoose.models[name]) return mongoose.models[name];
  const schema = new mongoose.Schema({}, { strict: false, collection: collection || undefined });
  return mongoose.model(name, schema);
}

function buildModels() {
  return {
    // Existing collections (read) — explicit names matching the running app.
    Staff: dynamicModel('Staff', 'staffs'),
    StaffDocument: dynamicModel('StaffDocument', 'staffdocuments'),
    ApplicationDocument: dynamicModel('ApplicationDocument', 'applicationdocuments'),
    ApplicationForm: dynamicModel('ApplicationForm', 'applicationforms'),
    JobApplication: dynamicModel('JobApplication', 'jobapplications'),
    JobPosition: dynamicModel('JobPosition', 'jobpositions'),

    // New compliance collections (read/write) — same model names as src/models
    // so Mongoose computes the identical collection name to the Next.js app.
    ComplianceRequirement: dynamicModel('ComplianceRequirement'),
    StaffComplianceRecord: dynamicModel('StaffComplianceRecord'),
    ComplianceEvidence: dynamicModel('ComplianceEvidence'),
    ComplianceEvent: dynamicModel('ComplianceEvent'),
  };
}

module.exports = { connect, disconnect, buildModels, mongoose };
