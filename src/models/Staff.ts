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
    // Position the staff member was hired into, stamped at application acceptance.
    // Perfex does not send these, so the CRM sync ($set of Perfex fields) leaves
    // them intact. Used for position-targeted compliance requirements.
    positionId?: string | null;
    positionTitle?: string | null;
    // Denormalized compliance sort key, refreshed on compliance changes. Lets the
    // staff list sort "issues first" at the DB level instead of computing per request.
    complianceSeverity?: number; // 3 attention, 2 in-progress, 1 compliant, 0 none/unknown
    complianceProblemCount?: number;
    complianceCheckedAt?: Date | null;
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
        },
        positionId: {
            type: String,
            default: null,
        },
        positionTitle: {
            type: String,
            default: null,
        },
        complianceSeverity: {
            type: Number,
            default: 0,
        },
        complianceProblemCount: {
            type: Number,
            default: 0,
        },
        complianceCheckedAt: {
            type: Date,
            default: null,
        },
    },
    // strict:false so every field Perfex sends is persisted, not silently dropped
    // for lacking a schema path (e.g. facebook, last_ip). NOTE: Perfex also sends
    // a `password` field — see sync routes if you want to strip it before storing.
    { timestamps: true, strict: false }
);

// Indexed so the staff-compliance list sorts "issues first" at the DB level.
StaffSchema.index({ complianceSeverity: -1, complianceProblemCount: -1 });

// Recompile a stale cached model that predates the compliance-sort fields, so the
// new path + index register (dev HMR keeps the old model on the global otherwise).
const cachedStaff = mongoose.models.Staff as mongoose.Model<StaffDocument> | undefined;
if (cachedStaff && !cachedStaff.schema.path('complianceSeverity')) {
    delete (mongoose.models as Record<string, unknown>).Staff;
}

export default (mongoose.models.Staff as mongoose.Model<StaffDocument>) ||
    mongoose.model<StaffDocument>('Staff', StaffSchema);
