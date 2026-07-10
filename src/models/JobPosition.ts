import mongoose from 'mongoose';

export interface CustomFieldDefinition {
    name: string;      // machine key (e.g. "years_of_experience")
    label: string;     // user-facing label (e.g. "Years of Experience")
    type: 'text' | 'paragraph' | 'number' | 'select' | 'checkbox' | 'file';
    required: boolean;
    options?: string[]; // choices for select/checkbox
    section?: string;   // form section this question belongs to (e.g. "Personal details")
}

export interface JobSection {
    label: string;     // e.g. "Key responsibilities", "Basic Qualifications"
    content: string;   // detailed text content
}

export interface JobPositionDocument extends mongoose.Document {
    title: string;
    sections: JobSection[];
    status: 'draft' | 'open' | 'closed';
    formId?: mongoose.Types.ObjectId;
    // Optional hero image for the public job detail page. `imagePublicId` is the
    // Cloudinary public_id, stored so the asset can be deleted precisely when the
    // image is replaced/removed or the position is deleted.
    imageUrl?: string | null;
    imagePublicId?: string | null;
    createdAt: Date;
    updatedAt: Date;
}

const JobPositionSchema = new mongoose.Schema<JobPositionDocument>(
    {
        title: {
            type: String,
            required: [true, 'Please provide a job title'],
            trim: true,
        },
        sections: [
            {
                label: { type: String, required: true },
                content: { type: String, required: true }
            }
        ],
        status: {
            type: String,
            enum: ['draft', 'open', 'closed'],
            default: 'draft',
        },
        formId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ApplicationForm',
        },
        imageUrl: {
            type: String,
            default: null,
        },
        imagePublicId: {
            type: String,
            default: null,
        },
    },
    { timestamps: true }
);

// Clear model cache in Next.js development HMR
if (mongoose.models && mongoose.models.JobPosition) {
    delete (mongoose.models as any).JobPosition;
}

export default mongoose.models.JobPosition || mongoose.model<JobPositionDocument>('JobPosition', JobPositionSchema);
