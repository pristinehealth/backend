import mongoose from 'mongoose';

/**
 * Policy definition for a single compliance obligation (e.g. "Practicing License").
 * These are the source-of-truth requirement records that staff compliance status
 * is measured against. Requirement `key` values intentionally reuse the existing
 * ApplicationDocument `documentType` values, so an accepted application's verified
 * documents materialize onto records by key (see linkApplicationDocumentsToStaff).
 *
 * Targeting is explicit/opt-in: a requirement applies to a staff member only
 * when `appliesToAll` is set, OR their position id is in `appliesToPositions`.
 * With neither, it applies to NOBODY. Manual per-staff assignments
 * (StaffComplianceRecord) apply regardless.
 *
 * `collectAtApplication` marks a requirement as a document requested on job
 * application forms. NOTE: general application questions and non-compliance file
 * uploads (résumé, etc.) are NOT requirements — they stay on
 * ApplicationForm.customFields, independent of this catalog.
 */
export type ComplianceEvidenceMode = 'file' | 'metadata_only' | 'either';

export interface ComplianceRequirementDoc extends mongoose.Document {
  key: string;
  label: string;
  description?: string;
  appliesToAll: boolean; // explicit "applies to every staff member"
  appliesToPositions: string[]; // targeted JobPosition ids
  collectAtApplication: boolean; // requested on job application forms
  evidenceMode: ComplianceEvidenceMode;
  requiresExpiry: boolean;
  expiryCheckDays: number;
  isMandatory: boolean;
  active: boolean;
  // Data retention: how long (days after a staff member is archived/terminated)
  // to keep this requirement's records/evidence before secure disposal. `null`
  // (the default) means indefinite / legal hold — nothing is auto-disposed until
  // an admin sets a real period. Confirm periods with compliance/legal counsel.
  retentionDays?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const ComplianceRequirementSchema = new mongoose.Schema<ComplianceRequirementDoc>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    label: { type: String, required: true },
    description: { type: String, default: '' },
    appliesToAll: { type: Boolean, default: false }, // opt-in: nobody unless targeted
    appliesToPositions: {
      type: [String],
      default: [],
    },
    collectAtApplication: { type: Boolean, default: false },
    evidenceMode: {
      type: String,
      enum: ['file', 'metadata_only', 'either'],
      default: 'file',
    },
    requiresExpiry: { type: Boolean, default: false },
    expiryCheckDays: { type: Number, default: 30 },
    isMandatory: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
    retentionDays: { type: Number, default: null }, // null = indefinite / legal hold
  },
  { timestamps: true }
);

export default mongoose.models.ComplianceRequirement ||
  mongoose.model<ComplianceRequirementDoc>('ComplianceRequirement', ComplianceRequirementSchema);
