import mongoose from 'mongoose';

// A globally-shared, admin-maintained library of downloadable blank forms
// (W-2, W-4, I-9, direct-deposit, handbook, …) that applicants/employees can
// download from their onboarding/tracking page. "Latest is automatic": replacing
// a form's file updates `fileUrl` in place, so everyone gets the current version.
//
// These are admin-uploaded reference files (not applicant-private), so they are
// stored as a normal admin upload and served through a signing proxy that keeps
// the storage URL server-side (and handles Cloudinary's PDF delivery restriction).
export interface DownloadableFormDocument extends mongoose.Document {
    title: string;
    description?: string;
    category?: string;
    fileUrl: string;
    fileName: string;
    active: boolean;
    order: number;
    uploadedByEmail: string;
    createdAt: Date;
    updatedAt: Date;
}

const DownloadableFormSchema = new mongoose.Schema<DownloadableFormDocument>(
    {
        title: { type: String, required: true, trim: true },
        description: { type: String, default: '' },
        category: { type: String, default: '' },
        fileUrl: { type: String, required: true },
        fileName: { type: String, default: '' },
        active: { type: Boolean, default: true },
        // Display order (ascending); ties fall back to createdAt.
        order: { type: Number, default: 0 },
        uploadedByEmail: { type: String, default: '' },
    },
    { timestamps: true }
);

// Applicant-facing lists fetch active forms in display order.
DownloadableFormSchema.index({ active: 1, order: 1 });

export default (mongoose.models.DownloadableForm as mongoose.Model<DownloadableFormDocument>) ||
    mongoose.model<DownloadableFormDocument>('DownloadableForm', DownloadableFormSchema);
