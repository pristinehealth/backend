import mongoose from 'mongoose';

export interface UserDocument extends mongoose.Document {
    name: string;
    email: string;
    password?: string;
    role: string;
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
    },
    { timestamps: true }
);

export default mongoose.models.User || mongoose.model<UserDocument>('User', UserSchema);
