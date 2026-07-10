import mongoose from 'mongoose';

export type UploadAssetStatus = 'pending' | 'consumed' | 'deleted';
export type UploadAssetUsageType = 'supporting_document' | 'custom_field' | 'position_image' | 'unknown';
export type UploadAssetSource = 'job_apply' | 'admin';

export interface UploadAssetDocument extends mongoose.Document {
  publicId: string;
  url: string;
  originalFileName?: string;
  source: UploadAssetSource;
  usageType: UploadAssetUsageType;
  jobId?: string;
  applicationId?: mongoose.Types.ObjectId;
  fieldKey?: string;
  documentType?: string;
  clientSessionId?: string;
  status: UploadAssetStatus;
  uploadedAt: Date;
  expiresAt: Date;
  consumedAt?: Date;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UploadAssetSchema = new mongoose.Schema<UploadAssetDocument>(
  {
    publicId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    url: {
      type: String,
      required: true,
    },
    originalFileName: {
      type: String,
      default: '',
    },
    source: {
      type: String,
      enum: ['job_apply', 'admin'],
      default: 'job_apply',
      index: true,
    },
    usageType: {
      type: String,
      enum: ['supporting_document', 'custom_field', 'position_image', 'unknown'],
      default: 'unknown',
    },
    jobId: {
      type: String,
      default: null,
      index: true,
    },
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JobApplication',
      default: null,
      index: true,
    },
    fieldKey: {
      type: String,
      default: null,
    },
    documentType: {
      type: String,
      default: null,
    },
    clientSessionId: {
      type: String,
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'consumed', 'deleted'],
      default: 'pending',
      index: true,
    },
    uploadedAt: {
      type: Date,
      default: () => new Date(),
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    consumedAt: {
      type: Date,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true, collection: 'uploadassets' }
);

UploadAssetSchema.index({ status: 1, expiresAt: 1 });

// Recompile a stale cached model that predates the `position_image` usageType /
// `admin` source so the widened enums register (dev HMR keeps the old model).
const cachedUploadAsset = mongoose.models.UploadAsset as mongoose.Model<UploadAssetDocument> | undefined;
if (cachedUploadAsset) {
  const usageEnum = (cachedUploadAsset.schema.path('usageType') as any)?.enumValues as string[] | undefined;
  if (!Array.isArray(usageEnum) || !usageEnum.includes('position_image')) {
    delete (mongoose.models as Record<string, unknown>).UploadAsset;
  }
}

export default (mongoose.models.UploadAsset as mongoose.Model<UploadAssetDocument>) ||
  mongoose.model<UploadAssetDocument>('UploadAsset', UploadAssetSchema);
