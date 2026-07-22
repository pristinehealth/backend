import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import JobPosition from '@/models/JobPosition';
import ApplicationForm from '@/models/ApplicationForm';
import JobApplication from '@/models/JobApplication';
import ApplicationDocument from '@/models/ApplicationDocument';
import UploadAsset from '@/models/UploadAsset';
import { type DocumentType } from '@/models/ApplicationDocument';
import { requiresFileUpload, getDocumentLabel, metadataValueError } from '@/lib/documentMetadata';
import { getApplicationDocumentRequirements } from '@/lib/compliance';
import { resolveFileReference } from '@/lib/uploadResolve';
import { sendNewApplicationAdminEmail } from '@/lib/mailer';
import Settings from '@/models/Settings';

export const dynamic = 'force-dynamic';

function generateInternalReference(): string {
    return `${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        await dbConnect();

        const { id } = await params;
        const job = await JobPosition.findById(id);

        if (!job) {
            return NextResponse.json({ error: 'Job position not found' }, { status: 404 });
        }

        if (job.status !== 'open') {
            return NextResponse.json({ error: 'This job position is closed and no longer accepting applications' }, { status: 400 });
        }

        const body = await request.json();
        const { applicantName, applicantEmail, customFieldValues = {}, documents = [], uploadedPublicIds = [], agreedToTerms } = body;

        if (!applicantEmail) {
            return NextResponse.json({ error: 'Applicant email is required' }, { status: 400 });
        }

        // Mandatory Privacy Policy + Terms of Service agreement.
        if (agreedToTerms !== true) {
            return NextResponse.json({ error: 'You must agree to the Privacy Policy and Terms of Service to apply.' }, { status: 400 });
        }

        // Custom fields come from the linked form; documents come from the
        // compliance catalog (single source of truth — same resolution the job
        // detail endpoint uses, so validation matches what the applicant saw).
        let formFields: any[] = [];
        if (job.formId) {
            const appForm = await ApplicationForm.findById(job.formId);
            if (appForm) formFields = appForm.customFields;
        }

        const documentRequirements = await getApplicationDocumentRequirements(id);
        const reqMetaByType = new Map(documentRequirements.map((r) => [r.documentType, r]));

        const validatedValues: Record<string, any> = {};
        for (const field of formFields) {
            const val = customFieldValues[field.name];

            const isEmpty = val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0);
            if (field.required && isEmpty) {
                return NextResponse.json({ error: `Field "${field.label}" is required` }, { status: 400 });
            }

            if (val !== undefined && val !== null && val !== '') {
                if (field.type === 'number') {
                    const num = Number(val);
                    if (isNaN(num)) {
                        return NextResponse.json({ error: `Field "${field.label}" must be a number` }, { status: 400 });
                    }
                    validatedValues[field.name] = num;
                } else if (field.type === 'checkbox') {
                    if (!Array.isArray(val)) {
                        return NextResponse.json({ error: `Field "${field.label}" must be an array of selected options` }, { status: 400 });
                    }
                    validatedValues[field.name] = val;
                } else {
                    validatedValues[field.name] = val;
                }
            }
        }

        // Custom-field file answers arrive as publicId references (or, legacy, a
        // URL). Resolve them to the stored URL server-side before persisting.
        for (const field of formFields) {
            if (field.type === 'file' && typeof validatedValues[field.name] === 'string' && validatedValues[field.name]) {
                validatedValues[field.name] = await resolveFileReference(validatedValues[field.name]);
            }
        }

        const submittedDocs = Array.isArray(documents) ? documents : [];
        const submittedByType = new Map<DocumentType, any>();
        submittedDocs
            .filter((doc) => doc && doc.documentType)
            .forEach((doc) => submittedByType.set(doc.documentType as DocumentType, doc));

        for (const rule of documentRequirements) {
            if (!rule.required) continue;

            const submitted = submittedByType.get(rule.documentType);
            if (!submitted) {
                return NextResponse.json({ error: `Document "${rule.label}" is required` }, { status: 400 });
            }

            // Metadata-only docs collect a typed value instead of a file.
            if (!rule.requiresFile) {
                if (typeof submitted.value !== 'string' || !submitted.value.trim()) {
                    return NextResponse.json({ error: `Please provide the required ${rule.label}` }, { status: 400 });
                }
                const fmtError = metadataValueError(rule.documentType as DocumentType, submitted.value);
                if (fmtError) {
                    return NextResponse.json({ error: fmtError }, { status: 400 });
                }
                continue;
            }

            if (typeof submitted.fileUrl !== 'string' || typeof submitted.fileName !== 'string' || !submitted.fileUrl || !submitted.fileName) {
                return NextResponse.json({ error: `Please upload the required ${rule.label} document` }, { status: 400 });
            }
        }

        for (const submitted of submittedDocs) {
            if (!submitted || !submitted.documentType) continue;
            const docType = submitted.documentType as string;
            const meta = reqMetaByType.get(docType);
            const needsFile = meta ? meta.requiresFile : requiresFileUpload(docType);
            const label = meta ? meta.label : getDocumentLabel(docType);
            if (needsFile) {
                if (typeof submitted.fileUrl !== 'string' || typeof submitted.fileName !== 'string' || !submitted.fileUrl || !submitted.fileName) {
                    return NextResponse.json({ error: `Selected document "${label}" is missing an uploaded file` }, { status: 400 });
                }
            }
        }

        const derivedFullName = [
            (validatedValues.first_name || '').toString().trim(),
            (validatedValues.last_name || '').toString().trim(),
        ].filter(Boolean).join(' ').trim();

        const normalizedApplicantName = (applicantName || '').toString().trim() || derivedFullName;
        if (!normalizedApplicantName) {
            return NextResponse.json({ error: 'Applicant name is required' }, { status: 400 });
        }

        const internalReference = generateInternalReference();

        const application = await JobApplication.create({
            jobId: job._id,
            applicantName: normalizedApplicantName,
            applicantEmail,
            customFieldValues: validatedValues,
            accessCode: internalReference,
            status: 'pending',
            termsAgreedAt: new Date(),
        });

        const normalizedDocs = (await Promise.all(submittedDocs
            .filter((doc) => doc && doc.documentType)
            .map(async (doc) => {
                const meta = reqMetaByType.get(doc.documentType as string);
                const needsFile = meta ? meta.requiresFile : requiresFileUpload(doc.documentType as DocumentType);

                if (needsFile) {
                    // The client sends a publicId reference (or, legacy, a URL) —
                    // resolve it to the stored URL server-side.
                    const fileUrl = await resolveFileReference(doc.publicId || doc.fileUrl);
                    return {
                        applicationId: application._id,
                        documentType: doc.documentType as DocumentType,
                        deliveryMethod: doc.deliveryMethod === 'email' ? 'email' : 'upload',
                        fileUrl,
                        fileName: typeof doc.fileName === 'string' ? doc.fileName : '',
                        value: '',
                        expiryDate: doc.expiryDate ? new Date(doc.expiryDate) : null,
                        uploadedAt: new Date(),
                        status: 'pending' as const,
                    };
                }

                // Metadata-only: persist a receipt only when a value was provided.
                // Expiry is intentionally left unset — the admin records it during review.
                const value = typeof doc.value === 'string' ? doc.value.trim() : '';
                if (!value) return null;
                return {
                    applicationId: application._id,
                    documentType: doc.documentType as DocumentType,
                    deliveryMethod: 'email' as const,
                    fileUrl: '',
                    fileName: '',
                    value,
                    expiryDate: null,
                    uploadedAt: new Date(),
                    status: 'pending' as const,
                };
            })))
            .filter((doc): doc is NonNullable<typeof doc> => doc !== null);

        if (normalizedDocs.length > 0) {
            await ApplicationDocument.insertMany(normalizedDocs);
        }

        const consumedPublicIds = Array.isArray(uploadedPublicIds)
            ? Array.from(new Set(uploadedPublicIds.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)))
            : [];

        if (consumedPublicIds.length > 0) {
            await UploadAsset.updateMany(
                {
                    publicId: { $in: consumedPublicIds },
                    status: 'pending',
                },
                {
                    $set: {
                        status: 'consumed',
                        consumedAt: new Date(),
                        applicationId: application._id,
                    },
                }
            );
        }

        // Notify the admin/recruiting inbox — gated by a settings toggle, and
        // best-effort so it never blocks the submit.
        try {
            const setting = await Settings.findOne({ key: 'app_notify_new_application' }).lean();
            const shouldNotify = (setting as any)?.value !== 'false';
            if (shouldNotify) {
                await sendNewApplicationAdminEmail({
                    applicantName: normalizedApplicantName,
                    applicantEmail,
                    jobTitle: job.title || 'Job Position',
                    applicationId: String(application._id),
                });
            }
        } catch (mailErr: any) {
            console.error('[Apply] Failed to send admin notification email:', mailErr?.message || mailErr);
        }

        return NextResponse.json({
            message: 'Application submitted successfully',
            applicationId: application._id,
        }, { status: 201 });

    } catch (error: any) {
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
