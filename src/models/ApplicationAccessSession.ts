import mongoose from 'mongoose';

export interface ApplicationAccessSessionDocument extends mongoose.Document {
  email: string;
  otpCode?: string;
  otpExpiry?: Date;
  accessTokenHash?: string;
  accessTokenExpiry?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ApplicationAccessSessionSchema = new mongoose.Schema<ApplicationAccessSessionDocument>(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    otpCode: {
      type: String,
      default: null,
    },
    otpExpiry: {
      type: Date,
      default: null,
    },
    accessTokenHash: {
      type: String,
      default: null,
    },
    accessTokenExpiry: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

ApplicationAccessSessionSchema.index({ email: 1 }, { unique: true });

export default mongoose.models.ApplicationAccessSession ||
  mongoose.model<ApplicationAccessSessionDocument>('ApplicationAccessSession', ApplicationAccessSessionSchema);
