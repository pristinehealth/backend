import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import JobApplication from '@/models/JobApplication';
import JobPosition from '@/models/JobPosition';
import ApplicationForm from '@/models/ApplicationForm';
import ApplicationDocument, { type DocumentType } from '@/models/ApplicationDocument';
import UploadAsset from '@/models/UploadAsset';
import { DOCUMENT_METADATA, requiresFileUpload } from '@/lib/documentMetadata';
import { verifyApplicationAccess } from '@/lib/applicationAccess';
import { getApplicationDocumentRequirements } from '@/lib/compliance';
import { deleteAssetByPublicId } from '@/lib/cloudinary';

export const dynamic = 'force-dynamic';

type DocumentRequirement = {
  documentType: DocumentType;
  required: boolean;
};

/**
 * The documents to collect for an application come from the live compliance
 * catalog (getApplicationDocumentRequirements) — the SAME source the apply flow
 * uses — so this page and edits stay in sync with Compliance → Requirements
 * instead of a stale form snapshot. Falls through to file-upload requirements.
 */
async function catalogRequirements(jobId: any): Promise<DocumentRequirement[]> {
  const reqs = await getApplicationDocumentRequirements(jobId ? String(jobId) : null);
  return reqs
    .filter((r) => r.requiresFile)
    .map((r) => ({ documentType: r.documentType as DocumentType, required: r.required }));
}

async function findTrackedApplication(id: string, email: string) {
  return JobApplication.findOne({
    _id: id,
    applicantEmail: { $regex: new RegExp(`^${email.trim()}$`, 'i') },
  });
}

function validateCustomFields(formFields: any[], customFieldValues: Record<string, any>) {
  const validatedValues: Record<string, any> = {};

  for (const field of formFields) {
    const value = customFieldValues[field.name];

    const isEmpty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
    if (field.required && isEmpty) {
      return { error: `Field \"${field.label}\" is required`, values: null };
    }

    if (isEmpty) {
      continue;
    }

    if (field.type === 'number') {
      const numberValue = Number(value);
      if (Number.isNaN(numberValue)) {
        return { error: `Field \"${field.label}\" must be a number`, values: null };
      }
      validatedValues[field.name] = numberValue;
      continue;
    }

    if (field.type === 'checkbox') {
      if (!Array.isArray(value)) {
        return { error: `Field \"${field.label}\" must be an array of selected options`, values: null };
      }
      validatedValues[field.name] = value;
      continue;
    }

    validatedValues[field.name] = value;
  }

  return { error: null, values: validatedValues };
}

function validateDocuments(rules: DocumentRequirement[], submittedDocs: any[]) {
  const submittedByType = new Map<DocumentType, any>();
  submittedDocs
    .filter((doc) => doc && doc.documentType)
    .forEach((doc) => submittedByType.set(doc.documentType as DocumentType, doc));

  for (const rule of rules) {
    if (!requiresFileUpload(rule.documentType)) {
      continue;
    }

    if (!rule.required) continue;

    const metadata = DOCUMENT_METADATA[rule.documentType];
    const submitted = submittedByType.get(rule.documentType);

    if (!submitted) {
      return `Document \"${metadata?.label || rule.documentType}\" is required`;
    }

    if (requiresFileUpload(rule.documentType)) {
      if (typeof submitted.fileUrl !== 'string' || typeof submitted.fileName !== 'string' || !submitted.fileUrl || !submitted.fileName) {
        return `Please upload the required ${metadata?.label || rule.documentType} document`;
      }
    }
  }

  for (const submitted of submittedDocs) {
    if (!submitted || !submitted.documentType) continue;
    const docType = submitted.documentType as DocumentType;
    const metadata = DOCUMENT_METADATA[docType];

    if (requiresFileUpload(docType)) {
      if (typeof submitted.fileUrl !== 'string' || typeof submitted.fileName !== 'string' || !submitted.fileUrl || !submitted.fileName) {
        return `Selected document \"${metadata?.label || docType}\" is missing an uploaded file`;
      }
    }
  }

  return null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await dbConnect();

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email') || '';
    const accessToken = searchParams.get('accessToken') || '';

    if (!email || !accessToken) {
      return NextResponse.json({ error: 'Email and access token are required' }, { status: 400 });
    }

    const hasAccess = await verifyApplicationAccess(email, accessToken);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Your session has expired. Request a new verification code.' }, { status: 401 });
    }

    const application = await findTrackedApplication(id, email);
    if (!application) {
      return NextResponse.json({ error: 'Application not found for the provided credentials' }, { status: 404 });
    }

    const job = await JobPosition.findById(application.jobId).select('title status formId').lean();
    const form = job?.formId
      ? await ApplicationForm.findById(job.formId)
          .select('name customFields requiredDocuments documentRequirements')
          .lean()
      : null;

    const documentRequirements = await catalogRequirements(application.jobId);

    const documents = await ApplicationDocument.find({ applicationId: application._id })
      .select('documentType deliveryMethod fileName fileUrl expiryDate status uploadedAt rejectionReason')
      .sort({ uploadedAt: -1 })
      .lean();

    return NextResponse.json({
      application: {
        _id: application._id,
        applicantName: application.applicantName,
        applicantEmail: application.applicantEmail,
        customFieldValues: application.customFieldValues,
        status: application.status,
        notes: application.notes,
        createdAt: application.createdAt,
        updatedAt: application.updatedAt,
      },
      job: {
        _id: job?._id,
        title: job?.title || 'Unknown Position',
        status: job?.status || 'closed',
      },
      form: {
        name: form?.name || 'Application Form',
        customFields: Array.isArray(form?.customFields) ? form?.customFields : [],
        documentRequirements,
      },
      documents,
      canEdit: application.status === 'changes_requested',
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await dbConnect();

    const { id } = await params;
    const body = await request.json();
    const {
      email,
      accessToken,
      applicantName,
      customFieldValues = {},
      documents = [],
      uploadedPublicIds = [],
    } = body;

    if (!email || !accessToken) {
      return NextResponse.json({ error: 'Email and access token are required' }, { status: 400 });
    }

    const hasAccess = await verifyApplicationAccess(email, accessToken);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Your session has expired. Request a new verification code.' }, { status: 401 });
    }

    const application = await findTrackedApplication(id, email);
    if (!application) {
      return NextResponse.json({ error: 'Application not found for the provided credentials' }, { status: 404 });
    }

    if (application.status !== 'changes_requested') {
      return NextResponse.json({ error: 'This application is currently locked for editing' }, { status: 403 });
    }

    const job = await JobPosition.findById(application.jobId).select('formId').lean();
    const form = job?.formId ? await ApplicationForm.findById(job.formId).lean() : null;

    const formFields = Array.isArray(form?.customFields) ? form.customFields : [];
    const documentRequirements = await catalogRequirements(application.jobId);

    const customValidation = validateCustomFields(formFields, customFieldValues);
    if (customValidation.error) {
      return NextResponse.json({ error: customValidation.error }, { status: 400 });
    }

    const submittedDocs = Array.isArray(documents) ? documents : [];
    const docValidation = validateDocuments(documentRequirements, submittedDocs);
    if (docValidation) {
      return NextResponse.json({ error: docValidation }, { status: 400 });
    }

    const validatedValues = customValidation.values || {};
    const derivedName = [
      (validatedValues.first_name || '').toString().trim(),
      (validatedValues.last_name || '').toString().trim(),
    ]
      .filter(Boolean)
      .join(' ')
      .trim();

    const normalizedApplicantName = (applicantName || '').toString().trim() || derivedName || application.applicantName;

    const normalizedDocs = submittedDocs
      .filter((doc) => doc && doc.documentType)
      .filter((doc) => requiresFileUpload(doc.documentType as DocumentType))
      .map((doc) => ({
        applicationId: application._id,
        documentType: doc.documentType as DocumentType,
        deliveryMethod: doc.deliveryMethod === 'email' ? 'email' : 'upload',
        fileUrl: typeof doc.fileUrl === 'string' ? doc.fileUrl : '',
        fileName: typeof doc.fileName === 'string' ? doc.fileName : '',
        expiryDate: doc.expiryDate ? new Date(doc.expiryDate) : null,
        uploadedAt: new Date(),
        status: 'pending' as const,
      }));

    const existingDocuments = await ApplicationDocument.find({ applicationId: application._id });
    const existingByType = new Map(
      existingDocuments.map((doc) => [doc.documentType, doc])
    );
    const submittedTypes = new Set(normalizedDocs.map((doc) => doc.documentType));

    application.applicantName = normalizedApplicantName;
    application.customFieldValues = validatedValues;
    application.status = 'pending';
    application.notes = [
      ...(Array.isArray(application.notes) ? application.notes : []),
      {
        author: 'Applicant',
        text: 'Application updated by candidate after admin review request.',
        createdAt: new Date(),
      },
    ];

    await application.save();

    for (const existingDocument of existingDocuments) {
      if (!submittedTypes.has(existingDocument.documentType)) {
        await existingDocument.deleteOne();
      }
    }

    for (const normalizedDoc of normalizedDocs) {
      const existingDocument = existingByType.get(normalizedDoc.documentType);

      if (!existingDocument) {
        await ApplicationDocument.create(normalizedDoc);
        continue;
      }

      const hasContentChanged =
        existingDocument.deliveryMethod !== normalizedDoc.deliveryMethod ||
        existingDocument.fileUrl !== normalizedDoc.fileUrl ||
        existingDocument.fileName !== normalizedDoc.fileName;

      const shouldPreserveVerification =
        existingDocument.status === 'verified' && !hasContentChanged;

      existingDocument.deliveryMethod = normalizedDoc.deliveryMethod;
      existingDocument.fileUrl = normalizedDoc.fileUrl;
      existingDocument.fileName = normalizedDoc.fileName;

      if (shouldPreserveVerification) {
        continue;
      }

      existingDocument.uploadedAt = new Date();
      existingDocument.expiryDate = null;
      existingDocument.status = 'pending';
      existingDocument.rejectionReason = null;
      await existingDocument.save();
    }

    const consumedPublicIds = Array.isArray(uploadedPublicIds)
      ? Array.from(new Set(uploadedPublicIds.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)))
      : [];

    if (consumedPublicIds.length > 0) {
      await UploadAsset.updateMany(
        { publicId: { $in: consumedPublicIds }, status: 'pending' },
        {
          $set: {
            status: 'consumed',
            consumedAt: new Date(),
            applicationId: application._id,
          },
        }
      );
    }

    return NextResponse.json({
      message: 'Application updated successfully',
      applicationId: application._id,
      status: application.status,
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await dbConnect();

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email') || '';
    const accessToken = searchParams.get('accessToken') || '';

    if (!email || !accessToken) {
      return NextResponse.json({ error: 'Email and access token are required' }, { status: 400 });
    }

    const hasAccess = await verifyApplicationAccess(email, accessToken);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Your session has expired. Request a new verification code.' }, { status: 401 });
    }

    const application = await findTrackedApplication(id, email);
    if (!application) {
      return NextResponse.json({ error: 'Application not found for the provided credentials' }, { status: 404 });
    }

    const uploadAssets = await UploadAsset.find({ applicationId: application._id }).select('publicId');
    for (const asset of uploadAssets) {
      if (asset.publicId) {
        await deleteAssetByPublicId(asset.publicId);
      }
    }

    await UploadAsset.deleteMany({ applicationId: application._id });
    await ApplicationDocument.deleteMany({ applicationId: application._id });
    await application.deleteOne();

    return NextResponse.json({ message: 'Application deleted successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
