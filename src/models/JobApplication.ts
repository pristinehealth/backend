import mongoose from 'mongoose';

export interface AdminNote {
    author: string;
    text: string;
    createdAt: Date;
}

export interface JobApplicationDocument extends mongoose.Document {
    jobId: mongoose.Types.ObjectId;
    applicantName: string;
    applicantEmail: string;
    customFieldValues: Map<string, any>;
    status: 'pending' | 'reviewed' | 'shortlisted' | 'rejected' | 'accepted' | 'changes_requested';
    notes: AdminNote[];
    accessCode: string;
    termsAgreedAt?: Date; // when the applicant accepted Privacy Policy + Terms
    // The Perfex `staffid` this application was hired into. Stamped once — at
    // accept time if the staff already exists, otherwise by the sync reconcile
    // when the staff first appears. This is the DEFINITIVE staff↔application link;
    // downstream reads key on it instead of re-matching "latest application by
    // email", so a second application the person later submits never pollutes
    // their staff profile. Null until the hire's staff row exists.
    acceptedStaffId?: string | null;
    createdAt: Date;
    updatedAt: Date;
}

const JobApplicationSchema = new mongoose.Schema<JobApplicationDocument>(
    {
        jobId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'JobPosition',
            required: [true, 'Please provide a job ID'],
        },
        applicantName: {
            type: String,
            required: [true, 'Please provide applicant name'],
            trim: true,
        },
        applicantEmail: {
            type: String,
            required: [true, 'Please provide applicant email'],
            trim: true,
            match: [
                /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
                'Please provide a valid email',
            ],
        },
        customFieldValues: {
            type: Map,
            of: mongoose.Schema.Types.Mixed,
            default: {},
        },
        status: {
            type: String,
            enum: ['pending', 'reviewed', 'shortlisted', 'rejected', 'accepted', 'changes_requested'],
            default: 'pending',
        },
        notes: [
            {
                author: { type: String, required: true },
                text: { type: String, required: true },
                createdAt: { type: Date, default: Date.now },
            },
        ],
        accessCode: {
            type: String,
            required: true,
        },
        termsAgreedAt: {
            type: Date,
            default: null,
        },
        acceptedStaffId: {
            type: String,
            default: null,
        },
    },
    { timestamps: true }
);

JobApplicationSchema.index({ applicantEmail: 1, accessCode: 1 });
// Case-insensitive index on email so compliance email-fallback lookups
// (JobApplication.find({ applicantEmail: { $in: [...] } }).collation(...)) are
// index-backed instead of a collection scan. Emails are stored with mixed case;
// strength:2 makes matching case-insensitive without a regex.
JobApplicationSchema.index(
    { applicantEmail: 1 },
    { collation: { locale: 'en', strength: 2 }, name: 'applicantEmail_ci' }
);
// Resolve "the application this staff was hired from" by the stamped link,
// sparse so the (many) not-yet-linked applications don't bloat the index.
JobApplicationSchema.index({ acceptedStaffId: 1 }, { sparse: true, name: 'acceptedStaffId_1' });

const existingModel = mongoose.models.JobApplication as mongoose.Model<JobApplicationDocument> | undefined;

if (existingModel) {
    const enumValues = (existingModel.schema.path('status') as any)?.enumValues as string[] | undefined;
    const hasAcceptedStaffId = !!existingModel.schema.path('acceptedStaffId');
    if ((Array.isArray(enumValues) && !enumValues.includes('changes_requested')) || !hasAcceptedStaffId) {
        delete mongoose.models.JobApplication;
    }
}

export default (mongoose.models.JobApplication as mongoose.Model<JobApplicationDocument>) ||
    mongoose.model<JobApplicationDocument>('JobApplication', JobApplicationSchema);
