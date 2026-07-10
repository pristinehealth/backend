import mongoose from 'mongoose';

export interface TimesheetDocument extends mongoose.Document {
    id: string; // Perfex timesheet ID
    task_id: string;
    start_time: string;
    end_time: string;
    staff_id: string;
    hourly_rate: string;
    note: string | null;
}

const TimesheetSchema = new mongoose.Schema<TimesheetDocument>(
    {
        id: {
            type: String,
            required: true,
            unique: true,
        },
        task_id: { type: String },
        start_time: { type: String },
        end_time: { type: String },
        staff_id: { type: String },
        hourly_rate: { type: String },
        note: { type: String, default: null },
    },
    // strict:false so every field Perfex sends is persisted, not silently dropped.
    { timestamps: true, strict: false }
);

export default mongoose.models.Timesheet || mongoose.model<TimesheetDocument>('Timesheet', TimesheetSchema);
