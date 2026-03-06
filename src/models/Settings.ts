import mongoose from 'mongoose';

export interface SettingsDocument extends mongoose.Document {
    key: string;
    value: string;
}

const SettingsSchema = new mongoose.Schema<SettingsDocument>(
    {
        key: { type: String, required: true, unique: true },
        value: { type: String, required: true },
    },
    { timestamps: true }
);

export default mongoose.models.Settings || mongoose.model<SettingsDocument>('Settings', SettingsSchema);
