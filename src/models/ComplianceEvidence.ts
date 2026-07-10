import mongoose from 'mongoose';

/**
 * Versioned evidence attached to a StaffComplianceRecord. Multiple evidence
 * documents can exist per record (history); the current one is flagged with
 * `isCurrent`. Evidence may be a real file (Cloudinary URL) or a metadata-only
 * receipt for sensitive documents that are never stored (SSN, state ID, etc.).
 */
export type ComplianceEvidenceSource =
  | 'applicant_upload'
  | 'admin_upload'
  | 'admin_metadata_record'
  | 'migration_backfill';

export type ComplianceDeliveryMethod = 'upload' | 'email' | 'manual';

export interface ComplianceEvidenceDoc extends mongoose.Document {
  recordId: mongoose.Types.ObjectId;
  source: ComplianceEvidenceSource;
  deliveryMethod: ComplianceDeliveryMethod;
  reference: string;  // recorded value for metadata-only evidence (the requirement names it)
  fileUrl: string;
  fileName: string;
  receivedAt: Date;
  isCurrent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ComplianceEvidenceSchema = new mongoose.Schema<ComplianceEvidenceDoc>(
  {
    recordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StaffComplianceRecord',
      required: true,
      index: true,
    },
    source: {
      type: String,
      enum: ['applicant_upload', 'admin_upload', 'admin_metadata_record', 'migration_backfill'],
      required: true,
    },
    deliveryMethod: {
      type: String,
      enum: ['upload', 'email', 'manual'],
      default: 'upload',
    },
    reference: { type: String, default: '' },
    fileUrl: { type: String, default: '' },
    fileName: { type: String, default: '' },
    receivedAt: { type: Date, default: () => new Date() },
    isCurrent: { type: Boolean, default: true },
  },
  { timestamps: true }
);

ComplianceEvidenceSchema.index({ recordId: 1, isCurrent: 1 });

// Recompile a stale cached model that predates the label/reference fields so the
// new paths register (dev HMR keeps the old model on the global otherwise).
const cachedEvidence = mongoose.models.ComplianceEvidence as mongoose.Model<ComplianceEvidenceDoc> | undefined;
if (cachedEvidence && !cachedEvidence.schema.path('reference')) {
  delete (mongoose.models as Record<string, unknown>).ComplianceEvidence;
}

export default (mongoose.models.ComplianceEvidence as mongoose.Model<ComplianceEvidenceDoc>) ||
  mongoose.model<ComplianceEvidenceDoc>('ComplianceEvidence', ComplianceEvidenceSchema);
