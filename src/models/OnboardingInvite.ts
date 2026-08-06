import mongoose from 'mongoose';

// A per-applicant onboarding/compliance REQUEST bundle + link lifecycle.
//
// When an admin asks an accepted applicant to self-serve (fill selected
// onboarding questionnaires and/or upload selected compliance documents), we
// mint an expiring signed link and record what was requested here. There is at
// most ONE active invite per application (unique on applicationId) — re-requesting
// updates this record rather than stacking history.
//
// The signed access token (see src/lib/applicationAccess.ts) is stateless and
// cannot be revoked; this record is what makes the link revocable/expirable: the
// applicant page and API always re-check `status === 'active'` and `expiresAt`.
export type OnboardingInviteStatus = 'active' | 'completed' | 'revoked' | 'expired';

export interface OnboardingInviteDocument extends mongoose.Document {
    applicationId: mongoose.Types.ObjectId;
    // Person-centric owner (EmployeeRecord). Phase 1: dual-written alongside
    // applicationId and backfilled by migration 012; not yet read. In Phase 2 the
    // "one active invite per person" uniqueness moves here from applicationId.
    employeeRecordId?: mongoose.Types.ObjectId | null;
    applicantEmail: string;
    applicantName: string;
    jobId?: mongoose.Types.ObjectId | null;
    // Questionnaires requested in this round (informational — the fillable set is
    // authoritatively derived from OnboardingResponse.assignee === 'applicant').
    onboardingFormIds: mongoose.Types.ObjectId[];
    // Compliance requirement keys the applicant is asked to provide.
    requestedDocumentKeys: string[];
    expiresAt: Date;
    status: OnboardingInviteStatus;
    createdByEmail: string;
    createdAt: Date;
    updatedAt: Date;
}

const OnboardingInviteSchema = new mongoose.Schema<OnboardingInviteDocument>(
    {
        applicationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'JobApplication',
            required: true,
            unique: true, // one active invite per application (mutable)
        },
        employeeRecordId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'EmployeeRecord',
            default: null,
            index: true,
        },
        applicantEmail: { type: String, default: '', lowercase: true, trim: true },
        applicantName: { type: String, default: '' },
        jobId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'JobPosition',
            default: null,
        },
        onboardingFormIds: {
            type: [mongoose.Schema.Types.ObjectId],
            ref: 'OnboardingForm',
            default: [],
        },
        requestedDocumentKeys: { type: [String], default: [] },
        expiresAt: { type: Date, required: true },
        status: {
            type: String,
            enum: ['active', 'completed', 'revoked', 'expired'],
            default: 'active',
        },
        createdByEmail: { type: String, default: '' },
    },
    { timestamps: true }
);

// Drop a stale cached model that predates the `employeeRecordId` path so a
// hot-reloaded dev server recompiles instead of silently stripping the new field.
const cachedInvite = mongoose.models.OnboardingInvite as mongoose.Model<OnboardingInviteDocument> | undefined;
if (cachedInvite && !cachedInvite.schema.path('employeeRecordId')) {
    delete (mongoose.models as Record<string, unknown>).OnboardingInvite;
}

export default (mongoose.models.OnboardingInvite as mongoose.Model<OnboardingInviteDocument>) ||
    mongoose.model<OnboardingInviteDocument>('OnboardingInvite', OnboardingInviteSchema);
