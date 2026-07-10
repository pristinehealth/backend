import mongoose from 'mongoose';
import { CustomFieldDefinition } from './JobPosition';
import type { DocumentType } from './ApplicationDocument';

// Document types are dynamic (compliance requirement keys). This list is only a
// convenience default for brand-new forms; it is no longer an enum constraint.
const DEFAULT_TEMPLATE_DOCUMENTS: DocumentType[] = [
    'practicing_license',
    'certification',
    'tb_test',
    'hepatitis_ab',
    'first_aid_cpr_bls',
    'car_insurance',
    'food_handlers',
];

export interface ApplicationFormDocument extends mongoose.Document {
    name: string;
    customFields: CustomFieldDefinition[];
    requiredDocuments: DocumentType[];
    documentRequirements: Array<{
        documentType: DocumentType;
        required: boolean;
    }>;
    createdAt: Date;
    updatedAt: Date;
}

const ApplicationFormSchema = new mongoose.Schema<ApplicationFormDocument>(
    {
        name: {
            type: String,
            required: [true, 'Please provide an application form name'],
            unique: true,
            trim: true,
        },
        customFields: [
            {
                name: { type: String, required: true },
                label: { type: String, required: true },
                type: {
                    type: String,
                    enum: ['text', 'paragraph', 'number', 'select', 'checkbox', 'file'],
                    required: true,
                },
                required: { type: Boolean, default: false },
                options: { type: [String], default: undefined },
                section: { type: String, default: undefined },
            },
        ],
        requiredDocuments: {
            type: [String],
            default: DEFAULT_TEMPLATE_DOCUMENTS,
        },
        documentRequirements: [
            {
                documentType: {
                    type: String,
                    required: true,
                },
                required: {
                    type: Boolean,
                    default: false,
                },
            },
        ],
    },
    { timestamps: true }
);

// If a previously-compiled model is cached WITHOUT the newer `customFields.section`
// path (e.g. after a schema change in dev), drop it so it recompiles with the
// current schema — otherwise strict mode would silently strip `section` on save.
const cachedForm = mongoose.models.ApplicationForm as mongoose.Model<ApplicationFormDocument> | undefined;
if (cachedForm) {
    const customFieldsPath = cachedForm.schema.path('customFields') as any;
    const hasSection = !!customFieldsPath?.schema?.path?.('section');
    if (!hasSection) {
        delete (mongoose.models as Record<string, unknown>).ApplicationForm;
    }
}

export default (mongoose.models.ApplicationForm as mongoose.Model<ApplicationFormDocument>) ||
    mongoose.model<ApplicationFormDocument>('ApplicationForm', ApplicationFormSchema);
