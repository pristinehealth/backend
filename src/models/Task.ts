import mongoose from 'mongoose';

export interface TaskDocument extends mongoose.Document {
    id: string; // Perfex task ID
    name: string;
    description: string;
    priority: string;
    dateadded: string;
    startdate: string;
    duedate: string;
    status: string;
    hourly_rate: string;
    milestone?: string;       // Perfex milestone ID
    milestone_name: string;   // Perfex milestone label
    billable?: string;        // '1' = billable, '0' = not billable
    is_public?: string;
    assignees?: any[];
    timesheets?: any[];
    checklist_items?: any[];
    project_data?: any;
    rel_type?: string;
    rel_id?: string;
}

const TaskSchema = new mongoose.Schema<TaskDocument>(
    {
        id: {
            type: String,
            required: true,
            unique: true,
        },
        name: { type: String },
        description: { type: String },
        priority: { type: String },
        dateadded: { type: String },
        startdate: { type: String },
        duedate: { type: String },
        status: { type: String },
        hourly_rate: { type: String },
        milestone: { type: String },
        milestone_name: { type: String },
        billable: { type: String },
        is_public: { type: String },
        assignees: {
            type: [mongoose.Schema.Types.Mixed],
            default: []
        },
        timesheets: {
            type: [mongoose.Schema.Types.Mixed],
            default: []
        },
        checklist_items: {
            type: [mongoose.Schema.Types.Mixed],
            default: []
        },
        project_data: { type: mongoose.Schema.Types.Mixed },
        rel_type: { type: String },
        rel_id: { type: String }
    },
    { timestamps: true }
);

export default mongoose.models.Task || mongoose.model<TaskDocument>('Task', TaskSchema);
