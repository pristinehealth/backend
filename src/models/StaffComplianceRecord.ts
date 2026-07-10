import mongoose from 'mongoose';

/**
 * One record per (staff member + compliance requirement). This is the
 * authoritative compliance status for a staff member, independent of the
 * hiring/application data structures. Status transitions are driven by
 * verification actions and expiry checks and are audited via ComplianceEvent.
 */
export type ComplianceStatus = 'missing' | 'pending' | 'verified' | 'rejected' | 'expired';

export interface StaffComplianceRecordDoc extends mongoose.Document {
  staffId: string;
  staffEmail: string;
  requirementKey: string;
  status: ComplianceStatus;
  dueDate?: Date | null;
  expiryDate?: Date | null;
  verifiedAt?: Date | null;
  verifiedBy?: string | null;
  rejectionReason?: string | null;
  lastCheckedAt?: Date | null;
  // True when an admin attached this requirement to the staff member directly,
  // rather than it applying via role/position targeting. Manually-assigned
  // records always surface for the staff member regardless of targeting.
  assignedManually?: boolean;
  // Set when the staff member is terminated/removed from Perfex. Starts the
  // retention clock; secure disposal happens retentionDays after this.
  archivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const StaffComplianceRecordSchema = new mongoose.Schema<StaffComplianceRecordDoc>(
  {
    staffId: {
      type: String,
      required: true,
      index: true,
    },
    staffEmail: {
      type: String,
      required: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    requirementKey: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['missing', 'pending', 'verified', 'rejected', 'expired'],
      default: 'missing',
    },
    dueDate: { type: Date, default: null },
    expiryDate: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: String, default: null },
    rejectionReason: { type: String, default: null },
    lastCheckedAt: { type: Date, default: null },
    assignedManually: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// One record per staff member per requirement.
StaffComplianceRecordSchema.index({ staffId: 1, requirementKey: 1 }, { unique: true });
StaffComplianceRecordSchema.index({ expiryDate: 1, status: 1 });
StaffComplianceRecordSchema.index({ archivedAt: 1 }); // disposal sweep

export default mongoose.models.StaffComplianceRecord ||
  mongoose.model<StaffComplianceRecordDoc>('StaffComplianceRecord', StaffComplianceRecordSchema);
