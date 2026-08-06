import mongoose from 'mongoose';
import type { AdminNote } from './JobApplication';

// One onboarding record per (accepted application × questionnaire). A candidate
// can hold several — e.g. general screening plus a background check — and the
// candidate-level status is rolled up from them (see src/lib/onboardingProgress).
// Kept SEPARATE from JobApplication so filling one in never touches the
// application's `accepted` status or its `customFieldValues`. "Not started" is
// the absence of any record; each record is 'in_progress' until an admin marks
// it 'completed'.
export interface OnboardingResponseDocument extends mongoose.Document {
    applicationId: mongoose.Types.ObjectId;
    // Person-centric owner (EmployeeRecord). Phase 1: dual-written + backfilled by
    // migration 012; not yet read. Phase 2 keys reads on this instead.
    employeeRecordId?: mongoose.Types.ObjectId | null;
    onboardingFormId: mongoose.Types.ObjectId;
    jobId?: mongoose.Types.ObjectId | null;
    applicantName: string;
    applicantEmail: string;
    // Who is expected to fill this questionnaire. 'admin' = the recruiter fills it
    // internally (the original behavior); 'applicant' = the accepted candidate
    // fills it themselves via an expiring onboarding link. Default 'admin' so
    // every existing record keeps its current behavior.
    assignee: 'admin' | 'applicant';
    // Snapshot of the questionnaire name so candidate lists can render the packet
    // without an extra lookup per row. The questionnaire remains the source of
    // truth; this is refreshed whenever the record is read via its own endpoint.
    formName: string;
    // Position within the candidate's packet (ascending). Ties fall back to
    // createdAt, so records predating this field still order sensibly.
    order: number;
    // Keyed by CustomFieldDefinition.name, exactly like customFieldValues.
    answers: Map<string, any>;
    // Denormalized progress counters, recomputed on every save in the PATCH
    // handler (which already loads the questionnaire's fields). Lets the
    // candidate list show "4 / 9 answered" without loading every answers Map.
    answeredCount: number;
    totalCount: number;
    requiredCount: number;
    status: 'in_progress' | 'completed';
    notes: AdminNote[];
    startedByEmail?: string;
    completedAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const OnboardingResponseSchema = new mongoose.Schema<OnboardingResponseDocument>(
    {
        applicationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'JobApplication',
            required: true,
            // NOT unique — a candidate holds one record per assigned
            // questionnaire. Uniqueness is enforced on the pair below.
        },
        employeeRecordId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'EmployeeRecord',
            default: null,
            index: true,
        },
        onboardingFormId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'OnboardingForm',
            required: true,
        },
        jobId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'JobPosition',
            default: null,
        },
        applicantName: { type: String, default: '' },
        applicantEmail: { type: String, default: '' },
        assignee: {
            type: String,
            enum: ['admin', 'applicant'],
            default: 'admin',
        },
        formName: { type: String, default: '' },
        order: { type: Number, default: 0 },
        answers: {
            type: Map,
            of: mongoose.Schema.Types.Mixed,
            default: {},
        },
        answeredCount: { type: Number, default: 0 },
        totalCount: { type: Number, default: 0 },
        requiredCount: { type: Number, default: 0 },
        status: {
            type: String,
            enum: ['in_progress', 'completed'],
            default: 'in_progress',
        },
        notes: [
            {
                author: { type: String, required: true },
                text: { type: String, required: true },
                createdAt: { type: Date, default: Date.now },
            },
        ],
        startedByEmail: { type: String, default: '' },
        completedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

// A candidate may hold many questionnaires, but never the same one twice.
OnboardingResponseSchema.index(
    { applicationId: 1, onboardingFormId: 1 },
    { unique: true, name: 'applicationId_onboardingFormId_unique' }
);
// Packet lookups for a candidate list page.
OnboardingResponseSchema.index({ applicationId: 1, order: 1 });

// The legacy `applicationId_1` UNIQUE index (from when there was one record per
// application) still exists on deployed databases and will reject the second
// questionnaire with E11000 — Mongoose never drops indexes it no longer declares.
// Run migrations/010-onboarding-multi-questionnaire.js to drop it.

// Drop a stale cached model that predates the `assignee` path so the schema
// recompiles instead of silently stripping it (mirrors OnboardingForm's guard).
const cachedResponse = mongoose.models.OnboardingResponse as mongoose.Model<OnboardingResponseDocument> | undefined;
if (cachedResponse && (!cachedResponse.schema.path('assignee') || !cachedResponse.schema.path('employeeRecordId'))) {
    delete (mongoose.models as Record<string, unknown>).OnboardingResponse;
}

export default (mongoose.models.OnboardingResponse as mongoose.Model<OnboardingResponseDocument>) ||
    mongoose.model<OnboardingResponseDocument>('OnboardingResponse', OnboardingResponseSchema);
