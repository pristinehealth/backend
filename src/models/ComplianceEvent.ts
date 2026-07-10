import mongoose from 'mongoose';

/**
 * Append-only audit log for compliance activity. Every meaningful change to a
 * StaffComplianceRecord (creation, evidence added, verify/reject, expiry set,
 * reminder sent, migration) writes one immutable event with its actor and a
 * free-form payload. This is the source of truth for compliance audit exports.
 */
export type ComplianceEventType =
  | 'record_created'
  | 'evidence_added'
  | 'verified'
  | 'rejected'
  | 'expiry_set'
  | 'reminder_sent'
  | 'migrated'
  | 'archived'
  | 'disposed';

export interface ComplianceEventDoc extends mongoose.Document {
  recordId: mongoose.Types.ObjectId;
  eventType: ComplianceEventType;
  actor: string; // admin email/name or 'system'
  payload: Record<string, any>;
  createdAt: Date;
}

const ComplianceEventSchema = new mongoose.Schema<ComplianceEventDoc>(
  {
    recordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StaffComplianceRecord',
      required: true,
      index: true,
    },
    eventType: {
      type: String,
      enum: ['record_created', 'evidence_added', 'verified', 'rejected', 'expiry_set', 'reminder_sent', 'migrated'],
      required: true,
    },
    actor: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  // Only createdAt matters for an append-only log; no updatedAt.
  { timestamps: { createdAt: true, updatedAt: false } }
);

ComplianceEventSchema.index({ recordId: 1, createdAt: -1 });

export default mongoose.models.ComplianceEvent ||
  mongoose.model<ComplianceEventDoc>('ComplianceEvent', ComplianceEventSchema);
