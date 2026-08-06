import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import JobApplication from '@/models/JobApplication';
import JobPosition from '@/models/JobPosition';
import ApplicationForm from '@/models/ApplicationForm';
import ApplicationDocument, { type DocumentType } from '@/models/ApplicationDocument';
import UploadAsset from '@/models/UploadAsset';
import { DOCUMENT_METADATA, requiresFileUpload, metadataValueError, sanitizeMetadataValue } from '@/lib/documentMetadata';
import { verifyApplicationAccess } from '@/lib/applicationAccess';
import { sanitizeApplicantNotes } from '@/lib/applicationNotes';
import { buildDocumentFileRef, buildFieldFileRef, isFileProxyRef } from '@/lib/applicationFiles';
import { resolveFileReference } from '@/lib/uploadResolve';
import { getApplicationDocumentRequirements } from '@/lib/compliance';
import { deleteAssetByPublicId } from '@/lib/cloudinary';
import { resolveEmployeeRecordIdByEmail } from '@/lib/employeeRecord';

export const dynamic = 'force-dynamic';

type DocumentRequirement = {
  documentType: DocumentType;
  required: boolean;
  // Authoritative file-vs-metadata flag from the requirement's configured
  // evidenceMode — NOT the static DOCUMENT_METADATA default, which can disagree
  // (e.g. an admin sets work_authorization to require a file even though the
  // built-in default is metadata-only).
  requiresFile: boolean;
};

/**
 * The documents to collect for an application come from the live compliance
 * catalog (getApplicationDocumentRequirements) — the SAME source the apply flow
 * uses — so this page and edits stay in sync with Compliance → Requirements
 * instead of a stale form snapshot. Both file and metadata-only requirements are
 * returned, each carrying its configured `requiresFile` flag.
 */
async function catalogRequirements(jobId: any): Promise<DocumentRequirement[]> {
  const reqs = await getApplicationDocumentRequirements(jobId ? String(jobId) : null);
  return reqs.map((r) => ({
    documentType: r.documentType as DocumentType,
    required: r.required,
    requiresFile: r.requiresFile,
  }));
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

  // File-vs-metadata comes from the requirement's configured flag, not the
  // static default. Requirements not in the catalog fall back to the static map.
  const requiresFileByType = new Map<DocumentType, boolean>(
    rules.map((r) => [r.documentType, r.requiresFile])
  );
  const isFile = (docType: DocumentType) =>
    requiresFileByType.has(docType) ? !!requiresFileByType.get(docType) : requiresFileUpload(docType);

  for (const rule of rules) {
    if (!rule.required) continue;

    const metadata = DOCUMENT_METADATA[rule.documentType];
    const submitted = submittedByType.get(rule.documentType);

    if (!submitted) {
      return `Document \"${metadata?.label || rule.documentType}\" is required`;
    }

    if (rule.requiresFile) {
      if (typeof submitted.fileUrl !== 'string' || typeof submitted.fileName !== 'string' || !submitted.fileUrl || !submitted.fileName) {
        return `Please upload the required ${metadata?.label || rule.documentType} document`;
      }
    } else {
      // Metadata-only: a typed value is required, and it must pass the same
      // format check the apply form enforces (e.g. SSN/State ID shape).
      const value = typeof submitted.value === 'string' ? submitted.value.trim() : '';
      if (!value) {
        return `Please provide the required ${metadata?.label || rule.documentType}`;
      }
      const fmtError = metadataValueError(rule.documentType, value);
      if (fmtError) return fmtError;
    }
  }

  for (const submitted of submittedDocs) {
    if (!submitted || !submitted.documentType) continue;
    const docType = submitted.documentType as DocumentType;
    const metadata = DOCUMENT_METADATA[docType];

    if (isFile(docType)) {
      if (typeof submitted.fileUrl !== 'string' || typeof submitted.fileName !== 'string' || !submitted.fileUrl || !submitted.fileName) {
        return `Selected document \"${metadata?.label || docType}\" is missing an uploaded file`;
      }
    } else if (typeof submitted.value === 'string' && submitted.value.trim()) {
      // A provided optional metadata value must still be well-formed.
      const fmtError = metadataValueError(docType, submitted.value.trim());
      if (fmtError) return fmtError;
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

    const rawDocuments = await ApplicationDocument.find({ applicationId: application._id })
      .select('documentType deliveryMethod fileName fileUrl value expiryDate status uploadedAt rejectionReason')
      .sort({ uploadedAt: -1 })
      .lean();

    // Credentials the client already holds, threaded into each proxy ref so the
    // viewer can stream the file without ever seeing the storage URL.
    const cred = new URLSearchParams({ email, accessToken }).toString();
    const appIdStr = String(application._id);

    // Swap each document's stored URL for a same-origin proxy ref. `value` (the
    // metadata-only typed value) passes through so the applicant can see/edit it.
    const documents = rawDocuments.map((doc: any) => ({
      ...doc,
      fileUrl: doc.fileUrl ? buildDocumentFileRef(appIdStr, String(doc._id), cred) : '',
    }));

    // Do the same for custom-field file uploads (their URL lives inside the
    // answer map). Non-file answers pass through untouched.
    const fileFieldNames = new Set(
      (Array.isArray(form?.customFields) ? form.customFields : [])
        .filter((f: any) => f.type === 'file')
        .map((f: any) => f.name)
    );
    const rawCustomValues = application.customFieldValues instanceof Map
      ? Object.fromEntries(application.customFieldValues)
      : (application.customFieldValues || {});
    const customFieldValues: Record<string, any> = {};
    for (const [key, value] of Object.entries(rawCustomValues)) {
      customFieldValues[key] = fileFieldNames.has(key) && typeof value === 'string' && value
        ? buildFieldFileRef(appIdStr, key, cred)
        : value;
    }

    return NextResponse.json({
      application: {
        _id: application._id,
        applicantName: application.applicantName,
        applicantEmail: application.applicantEmail,
        customFieldValues,
        status: application.status,
        notes: sanitizeApplicantNotes(application.notes),
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

    // Resolve custom-field file answers. An unchanged file comes back as our
    // proxy ref → keep the existing stored URL. A newly uploaded file comes back
    // as a publicId → resolve to its stored URL (a legacy raw URL passes through).
    for (const field of formFields) {
      if (field.type !== 'file') continue;
      const key = field.name;
      const value = validatedValues[key];
      if (value === undefined) continue;
      if (isFileProxyRef(value)) {
        const previous = application.customFieldValues?.get?.(key);
        validatedValues[key] = typeof previous === 'string' ? previous : '';
      } else {
        validatedValues[key] = await resolveFileReference(value);
      }
    }

    const derivedName = [
      (validatedValues.first_name || '').toString().trim(),
      (validatedValues.last_name || '').toString().trim(),
    ]
      .filter(Boolean)
      .join(' ')
      .trim();

    const normalizedApplicantName = (applicantName || '').toString().trim() || derivedName || application.applicantName;

    const existingDocuments = await ApplicationDocument.find({ applicationId: application._id });
    const existingByType = new Map(
      existingDocuments.map((doc) => [doc.documentType, doc])
    );

    // Authoritative file-vs-metadata per requirement (configured evidenceMode),
    // falling back to the static default for anything outside the catalog.
    const requiresFileByType = new Map<DocumentType, boolean>(
      documentRequirements.map((r) => [r.documentType, r.requiresFile])
    );
    const docIsFile = (docType: DocumentType) =>
      requiresFileByType.has(docType) ? !!requiresFileByType.get(docType) : requiresFileUpload(docType);

    // Dual-write the person-centric owner (EmployeeRecord, Phase 1) onto any docs
    // created below. Best-effort; migration 012 backfills a miss.
    const employeeRecordId = await resolveEmployeeRecordIdByEmail(application.applicantEmail, {
      name: application.applicantName,
      applicationId: application._id,
    });

    const normalizedDocs = await Promise.all(submittedDocs
      .filter((doc) => doc && doc.documentType)
      // Metadata-only docs persist a typed value instead of a file; keep one only
      // when a value was actually provided (an empty optional stays unsubmitted).
      .filter((doc) => docIsFile(doc.documentType as DocumentType)
        || (typeof doc.value === 'string' && doc.value.trim()))
      .map(async (doc) => {
        const isFile = docIsFile(doc.documentType as DocumentType);
        if (!isFile) {
          return {
            applicationId: application._id,
            employeeRecordId,
            documentType: doc.documentType as DocumentType,
            deliveryMethod: 'email' as const,
            fileUrl: '',
            fileName: '',
            value: sanitizeMetadataValue(doc.documentType as DocumentType, String(doc.value || '').trim()),
            expiryDate: null,
            uploadedAt: new Date(),
            status: 'pending' as const,
          };
        }
        return {
          applicationId: application._id,
          employeeRecordId,
          documentType: doc.documentType as DocumentType,
          deliveryMethod: doc.deliveryMethod === 'email' ? 'email' : 'upload',
          // A proxy ref means "unchanged" → keep the existing stored URL. Otherwise
          // it is a fresh upload: a publicId to resolve (or, legacy, a raw URL).
          fileUrl: isFileProxyRef(doc.fileUrl)
            ? (existingByType.get(doc.documentType as DocumentType)?.fileUrl || '')
            : await resolveFileReference(doc.publicId || doc.fileUrl),
          fileName: typeof doc.fileName === 'string' ? doc.fileName : '',
          value: '',
          expiryDate: doc.expiryDate ? new Date(doc.expiryDate) : null,
          uploadedAt: new Date(),
          status: 'pending' as const,
        };
      }));

    const submittedTypes = new Set(normalizedDocs.map((doc) => doc.documentType));

    application.applicantName = normalizedApplicantName;
    application.customFieldValues = new Map(Object.entries(validatedValues));
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
        existingDocument.fileName !== normalizedDoc.fileName ||
        (existingDocument.value || '') !== (normalizedDoc.value || '');

      const shouldPreserveVerification =
        existingDocument.status === 'verified' && !hasContentChanged;

      existingDocument.deliveryMethod = normalizedDoc.deliveryMethod;
      existingDocument.fileUrl = normalizedDoc.fileUrl;
      existingDocument.fileName = normalizedDoc.fileName;
      existingDocument.value = normalizedDoc.value;

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
