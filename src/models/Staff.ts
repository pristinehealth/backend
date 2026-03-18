import mongoose from 'mongoose';

export interface StaffDocument extends mongoose.Document {
    staffid: string;
    email: string;
    firstname: string;
    lastname: string;
    phonenumber: string;
    datecreated: string;
    admin: string;
    role: string;
    active: string;
    default_language: string;
    full_name: string;
    profile_image: string | null;
    customfields?: any[];
    otpCode?: string | null;
    otpExpiry?: Date | null;
    passwordHash?: string | null;
    emailVerified?: boolean;
    isBackendRegistered?: boolean;
    activeTimer?: { taskId: string, startTime: number };
}

const StaffSchema = new mongoose.Schema<StaffDocument>(
    {
        staffid: {
            type: String,
            required: true,
            unique: true,
        },
        email: {
            type: String,
        },
        firstname: {
            type: String,
        },
        lastname: {
            type: String,
        },
        phonenumber: {
            type: String,
        },
        datecreated: {
            type: String,
        },
        admin: {
            type: String,
        },
        role: {
            type: String,
        },
        active: {
            type: String,
        },
        default_language: {
            type: String,
        },
        full_name: {
            type: String,
        },
        profile_image: {
            type: String,
            default: null,
        },
        customfields: {
            type: [mongoose.Schema.Types.Mixed],
            default: []
        },
        otpCode: {
            type: String,
            default: null,
        },
        otpExpiry: {
            type: Date,
            default: null,
        },
        passwordHash: {
            type: String,
            default: null,
        },
        emailVerified: {
            type: Boolean,
            default: false,
        },
        isBackendRegistered: {
            type: Boolean,
            default: false,
        },
        activeTimer: {
            taskId: { type: String },
            startTime: { type: Number }
        }
    },
    { timestamps: true }
);

export default mongoose.models.Staff || mongoose.model<StaffDocument>('Staff', StaffSchema);
