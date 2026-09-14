import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import dbConnect from '@/lib/mongoose';
import ApplicationDocument, { type DocumentType } from '@/models/ApplicationDocument';
import JobApplication from '@/models/JobApplication';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getApplicationDocumentRequirements } from '@/lib/compliance';
import { resolveEmployeeRecordIdByEmail } from '@/lib/employeeRecord';

interface MultiPartFormData {
  get(key: string): File | string | null;
  getAll(key: string): (File | string)[];
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    const { id: appId } = await params;

    // Verify application exists
    const application = await JobApplication.findById(appId).select('applicantEmail applicantName');
    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    // Only applicant or admin can upload
    const isAdmin = session.user?.role === 'admin' || session.user?.role === 'superadmin';
    const isApplicant = session.user?.email === application.applicantEmail;
    if (!isApplicant && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await request.formData() as unknown as MultiPartFormData;
    const documentType = formData.get('documentType') as DocumentType;
    const file = formData.get('file') as File;
    const expiryDateStr = formData.get('expiryDate') as string | null;

    if (!documentType || !file) {
      return NextResponse.json(
        { error: 'Missing documentType or file' },
        { status: 400 }
      );
    }

    // Upload file to Cloudinary
    const uploadFormData = new FormData();
    uploadFormData.append('file', file);
    uploadFormData.append('upload_preset', process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || '');
    uploadFormData.append('folder', `pristine/applications/${appId}/documents`);

    const uploadRes = await fetch('https://api.cloudinary.com/v1_1/pristine-health/auto/upload', {
      method: 'POST',
      body: uploadFormData,
    });

    if (!uploadRes.ok) {
      console.error('[Document Upload] Cloudinary error:', await uploadRes.text());
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      );
    }

    const cloudinaryData = await uploadRes.json() as any;
    const fileUrl = cloudinaryData.secure_url;

    // Create document record. Dual-write the person-centric owner (EmployeeRecord,
    // Phase 1); best-effort, migration 012 backfills a miss.
    const expiryDate = expiryDateStr ? new Date(expiryDateStr) : null;
    const employeeRecordId = await resolveEmployeeRecordIdByEmail(application.applicantEmail, {
      name: application.applicantName,
      applicationId: appId,
    });
    const doc = await ApplicationDocument.create({
      applicationId: appId,
      employeeRecordId,
      documentType,
      fileUrl,
      fileName: file.name,
      expiryDate: expiryDate || null,
      status: 'pending',
    });

    return NextResponse.json(
      {
        success: true,
        document: {
          id: doc._id,
          documentType: doc.documentType,
          fileName: doc.fileName,
          expiryDate: doc.expiryDate,
          status: doc.status,
          uploadedAt: doc.uploadedAt,
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('[Document Upload] Error:', err?.message || err);
    return NextResponse.json(
      { error: err?.message || 'Failed to upload document' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    const { id: appId } = await params;

    // Verify access
    const application = await JobApplication.findById(appId).select('applicantEmail jobId');
    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    const isAdmin = session.user?.role === 'admin' || session.user?.role === 'superadmin';
    const isApplicant = session.user?.email === application.applicantEmail;
    if (!isApplicant && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch documents + the live requirement catalog so the reviewer can see
    // which requirements are outstanding (added after this person applied), not
    // just what was submitted. `requiresFile` is the configured evidenceMode.
    const [documents, requirements] = await Promise.all([
      ApplicationDocument.find({ applicationId: appId })
        .select('documentType deliveryMethod fileName fileUrl value expiryDate status uploadedAt rejectionReason')
        .sort({ uploadedAt: -1 }),
      getApplicationDocumentRequirements((application as any).jobId ? String((application as any).jobId) : null),
    ]);

    return NextResponse.json(
      {
        success: true,
        documents,
        requirements: requirements.map((r) => ({
          documentType: r.documentType,
          label: r.label,
          required: r.required,
          requiresFile: r.requiresFile,
        })),
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('[Document GET] Error:', err?.message || err);
    return NextResponse.json(
      { error: err?.message || 'Failed to fetch documents' },
      { status: 500 }
    );
  }
}
