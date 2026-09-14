import mongoose from 'mongoose';

/**
 * Document types are dynamic: they are compliance requirement `key`s (see the
 * ComplianceRequirement catalog). The built-in set below is retained only as a
 * convenience/seed reference — the field is no longer enum-constrained, so
 * custom requirement keys are valid document types too.
 */
export type DocumentType = string;

export const BUILTIN_DOCUMENT_TYPES = [
  'practicing_license',
  'certification',
  'state_id',
  'work_authorization',
  'tb_test',
  'hepatitis_ab',
  'first_aid_cpr_bls',
  'car_insurance',
  'food_handlers',
  'ssn',
] as const;

export type DocumentStatus = 'pending' | 'verified' | 'rejected' | 'expired';

export interface ApplicationDocumentDocument extends mongoose.Document {
  applicationId?: mongoose.Types.ObjectId | null;
  // Person-centric owner (EmployeeRecord). Phase 1: dual-written + backfilled by
  // migration 012; not yet read. In later phases this becomes the primary owner
  // so a document follows the person across positions, and `applicationId` is
  // retained only as provenance.
  employeeRecordId?: mongoose.Types.ObjectId | null;
  documentType: DocumentType;
  deliveryMethod: 'upload' | 'email';
  fileUrl: string;
  fileName: string;
  // Recorded value for a metadata-only document (e.g. the State ID / driving
  // license / SSN number the applicant types on the form). Empty for file docs
  // (schema default ''). Carried into ComplianceEvidence.reference at hire time.
  value?: string;
  expiryDate?: Date; // null for docs like SSN, State ID
  uploadedAt: Date;
  status: DocumentStatus;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ApplicationDocumentSchema = new mongoose.Schema<ApplicationDocumentDocument>(
  {
    // Optional (Phase 3): a document uploaded by a staff member with no
    // application has none — it's owned by the person (employeeRecordId). Dedup
    // per person+type is enforced in the upsert paths, not a DB unique index.
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JobApplication',
      default: null,
      index: true,
    },
    employeeRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmployeeRecord',
      default: null,
      index: true,
    },
    // Dynamic: a compliance requirement key. No enum constraint.
    documentType: {
      type: String,
      required: true,
    },
    deliveryMethod: {
      type: String,
      enum: ['upload', 'email'],
      default: 'upload',
    },
    fileUrl: { type: String, default: '' },
    fileName: { type: String, default: '' },
    value: { type: String, default: '' },
    expiryDate: { type: Date, default: null },
    uploadedAt: { type: Date, default: () => new Date() },
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected', 'expired'],
      default: 'pending',
    },
    rejectionReason: { type: String, default: null },
  },
  { timestamps: true }
);

// Recompile a stale cached model that predates the `value` field so the new
// path registers (dev HMR keeps the old model on the global otherwise).
const cachedApplicationDocument = mongoose.models.ApplicationDocument as
  | mongoose.Model<ApplicationDocumentDocument>
  | undefined;
if (cachedApplicationDocument && (!cachedApplicationDocument.schema.path('value') || !cachedApplicationDocument.schema.path('employeeRecordId'))) {
  delete (mongoose.models as Record<string, unknown>).ApplicationDocument;
}

export default mongoose.models.ApplicationDocument ||
  mongoose.model<ApplicationDocumentDocument>('ApplicationDocument', ApplicationDocumentSchema);
