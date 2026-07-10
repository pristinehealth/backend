import mongoose from 'mongoose';

export interface UserDocument extends mongoose.Document {
    name: string;
    email: string;
    password?: string;
    role: string;
    // Self-service password reset (OTP by email). All select:false so they never
    // leave the DB by accident. The OTP itself is stored bcrypt-hashed.
    resetOtpHash?: string;
    resetOtpExpiry?: Date;
    resetOtpAttempts?: number;
    createdAt: Date;
    updatedAt: Date;
}

const UserSchema = new mongoose.Schema<UserDocument>(
    {
        name: {
            type: String,
            required: [true, 'Please provide a name'],
        },
        email: {
            type: String,
            required: [true, 'Please provide an email'],
            unique: true,
            match: [
                /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
                'Please provide a valid email',
            ],
        },
        password: {
            type: String,
            required: [true, 'Please provide a password'],
            select: false, // Don't return password by default
        },
        role: {
            type: String,
            default: 'admin', // Enforcing this as an admin-only portal for now
            enum: ['admin', 'superadmin'],
        },
        resetOtpHash: { type: String, select: false },
        resetOtpExpiry: { type: Date, select: false },
        resetOtpAttempts: { type: Number, select: false },
    },
    { timestamps: true }
);

// Recompile a stale cached model that predates the password-reset fields so the
// new schema paths register. Dev HMR keeps the previously compiled model, and in
// strict mode Mongoose would silently strip resetOtp* from writes — leaving the
// reset code unstored and every verification failing with "invalid or expired".
const cachedUser = mongoose.models.User as mongoose.Model<UserDocument> | undefined;
if (cachedUser && !cachedUser.schema.path('resetOtpHash')) {
    delete (mongoose.models as Record<string, unknown>).User;
}

export default (mongoose.models.User as mongoose.Model<UserDocument>) ||
    mongoose.model<UserDocument>('User', UserSchema);
