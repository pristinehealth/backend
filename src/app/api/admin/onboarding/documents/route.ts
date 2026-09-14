import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import ApplicationDocument, { type DocumentType } from '@/models/ApplicationDocument';
import JobApplication from '@/models/JobApplication';
import { resolveEmployeeRecordIdByEmail } from '@/lib/employeeRecord';
import { sanitizeMetadataValue, metadataValueError, requiresFileUpload } from '@/lib/documentMetadata';

export const dynamic = 'force-dynamic';

async function isAdmin() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return false;
    const role = (session.user as any).role;
    return role === 'admin' || role === 'superadmin';
}

// Admin uploads a compliance document ON BEHALF OF someone in onboarding — e.g.
// the person emailed their file and the admin attaches it. Works for a candidate
// (applicationId) or a staff member (employeeRecordId). Upserts the
// ApplicationDocument for that owner + documentType; status 'pending'.
export async function POST(request: Request) {
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        await dbConnect();
        const body = await request.json();
        const applicationId = (body?.applicationId || '').toString();
        const employeeRecordId = (body?.employeeRecordId || '').toString();
        const documentType = (body?.documentType || '').toString().trim();
        const fileUrl = (body?.fileUrl || '').toString().trim();
        const fileName = (body?.fileName || '').toString().trim();
        const rawValue = typeof body?.value === 'string' ? body.value.trim() : '';
        const expiryDate = body?.expiryDate ? new Date(body.expiryDate) : null;

        if (!documentType) return NextResponse.json({ error: 'documentType is required' }, { status: 400 });
        if (!applicationId && !employeeRecordId) {
            return NextResponse.json({ error: 'applicationId or employeeRecordId is required' }, { status: 400 });
        }

        // Resolve the owner. For a candidate, also carry the employeeRecordId so the
        // document is person-centric (dual-write, like applicant uploads).
        let ownerFilter: Record<string, any>;
        let createOwner: { applicationId: any; employeeRecordId: any };
        if (applicationId) {
            const app = await JobApplication.findById(applicationId).select('applicantEmail applicantName').lean();
            if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
            const empId = await resolveEmployeeRecordIdByEmail((app as any).applicantEmail, { name: (app as any).applicantName, applicationId });
            ownerFilter = { applicationId };
            createOwner = { applicationId, employeeRecordId: empId };
        } else {
            ownerFilter = { employeeRecordId };
            createOwner = { applicationId: null, employeeRecordId };
        }

        const isFile = requiresFileUpload(documentType as DocumentType);
        let value = '';
        if (!isFile) {
            if (!rawValue) return NextResponse.json({ error: 'A value is required for this document.' }, { status: 400 });
            value = sanitizeMetadataValue(documentType as DocumentType, rawValue);
            const fmtError = metadataValueError(documentType as DocumentType, value);
            if (fmtError) return NextResponse.json({ error: fmtError }, { status: 400 });
        } else if (!fileUrl) {
            return NextResponse.json({ error: 'A file is required for this document.' }, { status: 400 });
        }

        const existing = await ApplicationDocument.findOne({ ...ownerFilter, documentType });
        if (existing) {
            existing.deliveryMethod = isFile ? 'upload' : 'email';
            existing.fileUrl = isFile ? fileUrl : '';
            existing.fileName = isFile ? (fileName || existing.fileName || 'Uploaded file') : '';
            existing.value = isFile ? '' : value;
            if (isFile && expiryDate) existing.expiryDate = expiryDate;
            existing.status = 'pending';
            existing.rejectionReason = null;
            existing.uploadedAt = new Date();
            if (createOwner.employeeRecordId && !existing.employeeRecordId) existing.employeeRecordId = createOwner.employeeRecordId;
            await existing.save();
            return NextResponse.json({ success: true, document: existing });
        }

        const doc = await ApplicationDocument.create({
            applicationId: createOwner.applicationId,
            employeeRecordId: createOwner.employeeRecordId,
            documentType,
            deliveryMethod: isFile ? 'upload' : 'email',
            fileUrl: isFile ? fileUrl : '',
            fileName: isFile ? (fileName || 'Uploaded file') : '',
            value: isFile ? '' : value,
            expiryDate: isFile ? expiryDate : null,
            uploadedAt: new Date(),
            status: 'pending',
        });
        return NextResponse.json({ success: true, document: doc }, { status: 201 });
    } catch (error: any) {
        console.error('POST /api/admin/onboarding/documents error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
