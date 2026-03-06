import mongoose from 'mongoose';

export interface Media {
    url: string;
    public_id?: string;
    provider?: string;
}

export interface ServiceReportDocument extends mongoose.Document {
    task_id: string;
    timesheet_id?: string;
    staff_id: string;
    time_taken: Date;
    note?: string;
    questionnaire?: any[];
    checklist_items?: any[];
    customer_signature?: Media;
    staff_signature?: Media;
}

// Reusable Media Schema for Signatures or File Uploads
const MediaSchema = new mongoose.Schema({
    url: { type: String, required: true },
    public_id: { type: String, required: false }, // Useful for Cloudinary deletion
    provider: { type: String, default: 'cloudinary' },
}, { _id: false });

const serviceReportSchema = new mongoose.Schema<ServiceReportDocument>({
    task_id: { type: String, required: true, index: true },
    timesheet_id: { type: String, required: false }, // Optional, linking back to the perfex timer if needed
    staff_id: { type: String, required: true },
    time_taken: { type: Date, required: true, default: Date.now },

    // Caregiver-provided inputs
    note: { type: String, required: false },
    questionnaire: { type: [mongoose.Schema.Types.Mixed], default: [] }, // Array of { question, answer }
    checklist_items: { type: [mongoose.Schema.Types.Mixed], default: [] }, // Array of { id, description, finished }

    // Enhanced Media Fields
    customer_signature: { type: MediaSchema, required: false },
    staff_signature: { type: MediaSchema, required: false },
}, { timestamps: true });

export default mongoose.models.ServiceReport || mongoose.model<ServiceReportDocument>('ServiceReport', serviceReportSchema);
