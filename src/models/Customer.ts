import mongoose from 'mongoose';

export interface CustomerDocument extends mongoose.Document {
    userid: string;
    company: string;
    phonenumber: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    active: string;
    datecreated: string;
    customfields?: any[];
}

const CustomerSchema = new mongoose.Schema<CustomerDocument>(
    {
        userid: {
            type: String,
            required: true,
            unique: true,
        },
        company: { type: String },
        phonenumber: { type: String },
        address: { type: String },
        city: { type: String },
        state: { type: String },
        zip: { type: String },
        country: { type: String },
        active: { type: String },
        datecreated: { type: String },
        customfields: {
            type: [mongoose.Schema.Types.Mixed],
            default: []
        }
    },
    { timestamps: true }
);

export default mongoose.models.Customer || mongoose.model<CustomerDocument>('Customer', CustomerSchema);
