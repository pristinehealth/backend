import mongoose from 'mongoose';
import type { AdminNote } from './JobApplication';

// One onboarding record per accepted application. Kept SEPARATE from
// JobApplication so filling it in never touches the application's `accepted`
// status or its `customFieldValues`. "Not started" is the absence of this
// record; once started it is 'in_progress' until an admin marks it 'completed'.
export interface OnboardingResponseDocument extends mongoose.Document {
    applicationId: mongoose.Types.ObjectId;
    onboardingFormId: mongoose.Types.ObjectId;
    jobId?: mongoose.Types.ObjectId | null;
    applicantName: string;
    applicantEmail: string;
    // Keyed by CustomFieldDefinition.name, exactly like customFieldValues.
    answers: Map<string, any>;
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
            unique: true, // one onboarding record per application
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
        answers: {
            type: Map,
            of: mongoose.Schema.Types.Mixed,
            default: {},
        },
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

export default (mongoose.models.OnboardingResponse as mongoose.Model<OnboardingResponseDocument>) ||
    mongoose.model<OnboardingResponseDocument>('OnboardingResponse', OnboardingResponseSchema);
