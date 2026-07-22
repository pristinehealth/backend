import mongoose from 'mongoose';
import { CustomFieldDefinition } from './JobPosition';

// An onboarding questionnaire template — the same field shape as ApplicationForm
// (see src/models/ApplicationForm.ts), but questions-only: no document/compliance
// requirements. Admins build these and fill them in interview-style for accepted
// candidates.
export interface OnboardingFormDocument extends mongoose.Document {
    name: string;
    customFields: CustomFieldDefinition[];
    createdAt: Date;
    updatedAt: Date;
}

const OnboardingFormSchema = new mongoose.Schema<OnboardingFormDocument>(
    {
        name: {
            type: String,
            required: [true, 'Please provide an onboarding questionnaire name'],
            unique: true,
            trim: true,
        },
        customFields: [
            {
                name: { type: String, required: true },
                label: { type: String, required: true },
                type: {
                    type: String,
                    enum: ['text', 'paragraph', 'number', 'select', 'checkbox', 'file', 'date'],
                    required: true,
                },
                required: { type: Boolean, default: false },
                options: { type: [String], default: undefined },
                section: { type: String, default: undefined },
            },
        ],
    },
    { timestamps: true }
);

// Drop a stale cached model that predates `customFields.section` so the schema
// recompiles instead of silently stripping the path (mirrors ApplicationForm).
const cachedForm = mongoose.models.OnboardingForm as mongoose.Model<OnboardingFormDocument> | undefined;
if (cachedForm) {
    const customFieldsPath = cachedForm.schema.path('customFields') as any;
    const hasSection = !!customFieldsPath?.schema?.path?.('section');
    if (!hasSection) {
        delete (mongoose.models as Record<string, unknown>).OnboardingForm;
    }
}

export default (mongoose.models.OnboardingForm as mongoose.Model<OnboardingFormDocument>) ||
    mongoose.model<OnboardingFormDocument>('OnboardingForm', OnboardingFormSchema);
