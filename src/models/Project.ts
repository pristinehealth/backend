import mongoose from 'mongoose';

export interface ProjectDocument extends mongoose.Document {
    id: string; // Perfex project ID
    name: string;
    description: string;
    status: string;
    clientid: string;
    billing_type: string;
    start_date: string;
    deadline: string;
    progress: string;
    estimated_hours: string;
    client_data?: any;
    customfields?: any[];
}

const ProjectSchema = new mongoose.Schema<ProjectDocument>(
    {
        id: {
            type: String,
            required: true,
            unique: true,
        },
        name: { type: String },
        description: { type: String },
        status: { type: String },
        clientid: { type: String },
        billing_type: { type: String },
        start_date: { type: String },
        deadline: { type: String },
        progress: { type: String },
        estimated_hours: { type: String },
        client_data: { type: mongoose.Schema.Types.Mixed },
        customfields: {
            type: [mongoose.Schema.Types.Mixed],
            default: []
        }
    },
    // strict:false so every field Perfex sends is persisted, not silently dropped
    // for lacking a schema path (e.g. project_created).
    { timestamps: true, strict: false }
);

export default mongoose.models.Project || mongoose.model<ProjectDocument>('Project', ProjectSchema);
