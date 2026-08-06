import mongoose from 'mongoose';

// A person-centric identity hub — the "Party" for the careers/staff domain.
//
// One record per human, keyed by EMAIL (the thread that runs from "applied" all
// the way to "hired") and/or the Perfex `staffId` (set once they become staff).
// It gathers the person's applications (they may apply to many positions), and
// — in later phases — owns their onboarding and compliance documents so those
// survive across applications and into staffhood.
//
// Identity policy (Phase 0): EMAIL-PRIMARY with MANUAL merge. A record's staffId
// is auto-linked onto an email-keyed record ONLY on an exact normalized-email
// match; every other "same person, different identifiers" case is resolved by a
// human via a merge action (recorded in `mergedFrom`). See
// docs/employee-record-plan.md.
//
// Invariant: a record always has at least one of `email` / `staffId`.
export type EmployeeRecordStatus = 'lead' | 'applicant' | 'onboarding' | 'staff' | 'inactive';

export interface EmployeeRecordDocument extends mongoose.Document {
    // Normalized (lowercased, trimmed) primary email. Unique among records that
    // have one (sparse) — Perfex-imported staff may have no email, so it is not
    // required on its own.
    email?: string | null;
    // The Perfex `staffid` once this person is a staff member. Unique-sparse.
    staffId?: string | null;
    // Best available display name (latest application name, else Staff name).
    name: string;
    // Applications this person has submitted — one per position applied.
    applicationIds: mongoose.Types.ObjectId[];
    status: EmployeeRecordStatus;
    // Where the current `email` came from, for provenance when reconciling.
    primaryEmailSource?: 'application' | 'staff' | 'manual' | null;
    // Audit trail: record ids absorbed into this one via a manual merge.
    mergedFrom?: mongoose.Types.ObjectId[];
    createdAt: Date;
    updatedAt: Date;
}

const EmployeeRecordSchema = new mongoose.Schema<EmployeeRecordDocument>(
    {
        email: {
            type: String,
            trim: true,
            lowercase: true,
            default: null,
        },
        staffId: {
            type: String,
            trim: true,
            default: null,
        },
        name: {
            type: String,
            default: '',
            trim: true,
        },
        applicationIds: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'JobApplication',
            },
        ],
        status: {
            type: String,
            enum: ['lead', 'applicant', 'onboarding', 'staff', 'inactive'],
            default: 'lead',
        },
        primaryEmailSource: {
            type: String,
            enum: ['application', 'staff', 'manual', null],
            default: null,
        },
        mergedFrom: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'EmployeeRecord',
            },
        ],
    },
    { timestamps: true }
);

// Identity keys — unique only among records that actually carry the value, so a
// record keyed solely by staffId (no email) and one keyed solely by email don't
// collide on a shared null. `partialFilterExpression` is preferred over a plain
// `sparse` unique index because it also ignores explicit `null`s (sparse only
// ignores missing fields), and we store `null` as the default.
EmployeeRecordSchema.index(
    { email: 1 },
    { unique: true, name: 'email_unique', partialFilterExpression: { email: { $type: 'string' } } }
);
EmployeeRecordSchema.index(
    { staffId: 1 },
    { unique: true, name: 'staffId_unique', partialFilterExpression: { staffId: { $type: 'string' } } }
);
// "Which record owns this application?" — multikey lookup.
EmployeeRecordSchema.index({ applicationIds: 1 });

// Enforce the invariant at the model layer: at least one identity key present.
EmployeeRecordSchema.pre('save', async function (this: EmployeeRecordDocument) {
    const hasEmail = typeof this.email === 'string' && this.email.trim() !== '';
    const hasStaff = typeof this.staffId === 'string' && this.staffId.trim() !== '';
    if (!hasEmail && !hasStaff) {
        throw new Error('EmployeeRecord requires at least one of email or staffId.');
    }
});

export default (mongoose.models.EmployeeRecord as mongoose.Model<EmployeeRecordDocument>) ||
    mongoose.model<EmployeeRecordDocument>('EmployeeRecord', EmployeeRecordSchema);
