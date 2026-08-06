import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import JobApplication from '@/models/JobApplication';
import JobPosition from '@/models/JobPosition';
import OnboardingForm from '@/models/OnboardingForm';
import OnboardingResponse from '@/models/OnboardingResponse';
import OnboardingInvite from '@/models/OnboardingInvite';
import ApplicationDocument, { type DocumentType } from '@/models/ApplicationDocument';
import UploadAsset from '@/models/UploadAsset';
import { verifyApplicationAccess } from '@/lib/applicationAccess';
import { getComplianceRequirements } from '@/lib/compliance';
import { validateAnswers } from '@/lib/onboardingAnswers';
import { resolveFileReference } from '@/lib/uploadResolve';
import { resolveEmployeeRecordIdByEmail } from '@/lib/employeeRecord';
import { requiresFileUpload, metadataValueError, sanitizeMetadataValue, getDocumentLabel } from '@/lib/documentMetadata';
import {
    buildOnboardingAnswerFileRef,
    buildOnboardingDocumentFileRef,
    isOnboardingFileProxyRef,
} from '@/lib/onboardingFiles';

export const dynamic = 'force-dynamic';

interface RequestedRequirement {
    documentType: string;
    label: string;
    required: boolean;
    requiresFile: boolean;
    storageMode: 'file' | 'metadata_only';
    requiresExpiry: boolean;
}

// Resolve the invite's requested requirement keys against the live catalog.
// Requested items are treated as required to complete the invite.
async function resolveRequestedRequirements(keys: string[]): Promise<RequestedRequirement[]> {
    if (!keys.length) return [];
    const active = await getComplianceRequirements();
    const byKey = new Map(active.map((r: any) => [r.key, r]));
    const out: RequestedRequirement[] = [];
    for (const key of keys) {
        const r: any = byKey.get(key);
        if (!r) continue;
        const requiresFile = r.evidenceMode !== 'metadata_only';
        out.push({
            documentType: key,
            label: r.label || getDocumentLabel(key as DocumentType),
            required: true,
            requiresFile,
            storageMode: requiresFile ? 'file' : 'metadata_only',
            requiresExpiry: !!r.requiresExpiry,
        });
    }
    return out;
}

async function findApp(applicationId: string, email: string) {
    return JobApplication.findOne({
        _id: applicationId,
        applicantEmail: { $regex: new RegExp(`^${email.trim()}$`, 'i') },
    });
}

function inviteValidity(invite: any): { valid: boolean; reason?: 'missing' | 'revoked' | 'expired' } {
    if (!invite) return { valid: false, reason: 'missing' };
    if (invite.status === 'revoked') return { valid: false, reason: 'revoked' };
    if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) return { valid: false, reason: 'expired' };
    if (invite.status !== 'active' && invite.status !== 'completed') return { valid: false, reason: 'expired' };
    return { valid: true };
}

export async function GET(request: Request, { params }: { params: Promise<{ applicationId: string }> }) {
    try {
        await dbConnect();
        const { applicationId } = await params;
        const { searchParams } = new URL(request.url);
        const email = searchParams.get('email') || '';
        const accessToken = searchParams.get('accessToken') || '';

        if (!email || !accessToken) {
            return NextResponse.json({ error: 'Email and access token are required' }, { status: 400 });
        }
        if (!(await verifyApplicationAccess(email, accessToken))) {
            return NextResponse.json({ error: 'Your session has expired. Request a new link.' }, { status: 401 });
        }

        const application = await findApp(applicationId, email);
        if (!application) {
            return NextResponse.json({ error: 'Application not found for the provided credentials' }, { status: 404 });
        }

        const invite = await OnboardingInvite.findOne({ applicationId });
        const validity = inviteValidity(invite);
        if (!validity.valid || !invite) {
            return NextResponse.json({
                valid: false,
                reason: validity.reason,
                applicantName: application.applicantName,
            });
        }

        const cred = new URLSearchParams({ email, accessToken }).toString();
        const job = await JobPosition.findById(application.jobId).select('title').lean();

        // Applicant-fillable questionnaires with their fields + current answers.
        const responses = await OnboardingResponse.find({ applicationId, assignee: 'applicant' })
            .sort({ order: 1, createdAt: 1 })
            .lean();
        const formIds = Array.from(new Set(responses.map((r: any) => String(r.onboardingFormId))));
        const forms = formIds.length
            ? await OnboardingForm.find({ _id: { $in: formIds } }).select('name customFields').lean()
            : [];
        const formById = new Map(forms.map((f: any) => [String(f._id), f]));

        const questionnaires = responses.map((r: any) => {
            const form = formById.get(String(r.onboardingFormId));
            const fields = Array.isArray(form?.customFields) ? form.customFields : [];
            const fileFieldNames = new Set(fields.filter((f: any) => f.type === 'file').map((f: any) => f.name));
            const rawAnswers = r.answers && typeof r.answers === 'object' ? r.answers : {};
            const answers: Record<string, any> = {};
            for (const [k, v] of Object.entries(rawAnswers)) {
                answers[k] = fileFieldNames.has(k) && typeof v === 'string' && v
                    ? buildOnboardingAnswerFileRef(applicationId, String(r._id), k, cred)
                    : v;
            }
            return {
                responseId: String(r._id),
                onboardingFormId: String(r.onboardingFormId),
                formName: form?.name || r.formName || 'Questionnaire',
                status: r.status,
                fields,
                answers,
            };
        });

        // Requested compliance requirements + any documents already submitted.
        const requirements = await resolveRequestedRequirements(invite.requestedDocumentKeys || []);
        const rawDocs = requirements.length
            ? await ApplicationDocument.find({ applicationId: application._id, documentType: { $in: requirements.map((r) => r.documentType) } })
                .select('documentType deliveryMethod fileName fileUrl value expiryDate status uploadedAt rejectionReason')
                .lean()
            : [];
        const documents = rawDocs.map((doc: any) => ({
            ...doc,
            fileUrl: doc.fileUrl ? buildOnboardingDocumentFileRef(applicationId, String(doc._id), cred) : '',
        }));

        return NextResponse.json({
            valid: true,
            applicantName: application.applicantName,
            applicantEmail: application.applicantEmail,
            jobTitle: job?.title || 'Position',
            expiresAt: invite.expiresAt,
            questionnaires,
            requirements,
            documents,
        });
    } catch (error: any) {
        console.error('GET /api/onboarding/track/[applicationId] error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ applicationId: string }> }) {
    try {
        await dbConnect();
        const { applicationId } = await params;
        const body = await request.json();
        const email = String(body?.email || '');
        const accessToken = String(body?.accessToken || '');
        const submit = body?.submit === true;

        if (!email || !accessToken) {
            return NextResponse.json({ error: 'Email and access token are required' }, { status: 400 });
        }
        if (!(await verifyApplicationAccess(email, accessToken))) {
            return NextResponse.json({ error: 'Your session has expired. Request a new link.' }, { status: 401 });
        }

        const application = await findApp(applicationId, email);
        if (!application) {
            return NextResponse.json({ error: 'Application not found for the provided credentials' }, { status: 404 });
        }

        const invite = await OnboardingInvite.findOne({ applicationId });
        const validity = inviteValidity(invite);
        if (!validity.valid || !invite) {
            return NextResponse.json({ error: 'This onboarding link is no longer valid.' }, { status: 403 });
        }

        // ── 1. Questionnaire answers ─────────────────────────────────────────
        const responseInputs: Array<{ responseId: string; answers: Record<string, any> }> =
            Array.isArray(body?.responses) ? body.responses : [];

        for (const input of responseInputs) {
            const responseDoc = await OnboardingResponse.findOne({
                _id: input.responseId,
                applicationId: application._id,
                assignee: 'applicant',
            });
            if (!responseDoc) continue; // ignore anything not ours

            const form = await OnboardingForm.findById(responseDoc.onboardingFormId).select('name customFields').lean();
            const fields = Array.isArray((form as any)?.customFields) ? (form as any).customFields : [];
            const existing = responseDoc.answers ? Object.fromEntries(responseDoc.answers as any) : {};

            const validation = await validateAnswers(fields, input.answers || {}, submit, {
                existing,
                isKeepRef: isOnboardingFileProxyRef,
            });
            if (validation.error) {
                return NextResponse.json({ error: validation.error }, { status: 400 });
            }

            const values = validation.values || {};
            const fieldNames = new Set(fields.map((f: any) => f.name));
            responseDoc.answers = new Map(Object.entries(values));
            responseDoc.answeredCount = Object.keys(values).filter((k) => fieldNames.has(k)).length;
            responseDoc.totalCount = fields.length;
            responseDoc.requiredCount = fields.filter((f: any) => f?.required).length;
            if ((form as any)?.name) responseDoc.formName = (form as any).name;
            if (submit) {
                responseDoc.status = 'completed';
                responseDoc.completedAt = new Date();
            }
            await responseDoc.save();
        }

        // ── 2. Requested compliance documents ────────────────────────────────
        const requirements = await resolveRequestedRequirements(invite.requestedDocumentKeys || []);
        const requiresFileByType = new Map(requirements.map((r) => [r.documentType, r.requiresFile]));
        const docIsFile = (dt: string) =>
            requiresFileByType.has(dt) ? !!requiresFileByType.get(dt) : requiresFileUpload(dt as DocumentType);

        const submittedDocs: any[] = Array.isArray(body?.documents) ? body.documents : [];
        const submittedByType = new Map(submittedDocs.filter((d) => d?.documentType).map((d) => [String(d.documentType), d]));

        // On submit, enforce that every required requested doc is provided/valid.
        if (submit) {
            for (const req of requirements) {
                if (!req.required) continue;
                const sub = submittedByType.get(req.documentType);
                const existingDoc = await ApplicationDocument.findOne({ applicationId: application._id, documentType: req.documentType }).select('fileUrl value').lean();
                if (req.requiresFile) {
                    const hasNew = sub && (isOnboardingFileProxyRef(sub.fileUrl) || (typeof (sub.publicId || sub.fileUrl) === 'string' && (sub.publicId || sub.fileUrl)));
                    const hasExisting = !!(existingDoc as any)?.fileUrl;
                    if (!hasNew && !hasExisting) {
                        return NextResponse.json({ error: `Please upload the required ${req.label}` }, { status: 400 });
                    }
                } else {
                    const value = (sub && typeof sub.value === 'string' && sub.value.trim()) || (existingDoc as any)?.value || '';
                    if (!value) {
                        return NextResponse.json({ error: `Please provide the required ${req.label}` }, { status: 400 });
                    }
                    const fmtError = metadataValueError(req.documentType as DocumentType, value.trim());
                    if (fmtError) return NextResponse.json({ error: fmtError }, { status: 400 });
                }
            }
        }

        // Person-centric owner for any documents created below (EmployeeRecord,
        // Phase 1 dual-write; best-effort, migration 012 backfills a miss).
        const employeeRecordId = await resolveEmployeeRecordIdByEmail(application.applicantEmail, {
            name: application.applicantName,
            applicationId: application._id,
        });

        // Upsert each provided document (never delete — onboarding saves are additive).
        for (const sub of submittedDocs) {
            if (!sub?.documentType) continue;
            const dt = String(sub.documentType);
            const isFile = docIsFile(dt);
            const existingDoc = await ApplicationDocument.findOne({ applicationId: application._id, documentType: dt });

            if (isFile) {
                let fileUrl = '';
                if (isOnboardingFileProxyRef(sub.fileUrl)) {
                    fileUrl = existingDoc?.fileUrl || '';
                } else if (typeof (sub.publicId || sub.fileUrl) === 'string' && (sub.publicId || sub.fileUrl)) {
                    fileUrl = await resolveFileReference(sub.publicId || sub.fileUrl);
                }
                if (!fileUrl) continue; // nothing new provided and nothing to keep
                const fileName = typeof sub.fileName === 'string' ? sub.fileName : (existingDoc?.fileName || '');
                const expiryDate = sub.expiryDate ? new Date(sub.expiryDate) : (existingDoc?.expiryDate || null);
                const unchanged = existingDoc && existingDoc.fileUrl === fileUrl && existingDoc.fileName === fileName;
                if (existingDoc) {
                    existingDoc.deliveryMethod = 'upload';
                    existingDoc.fileUrl = fileUrl;
                    existingDoc.fileName = fileName;
                    existingDoc.value = '';
                    if (!(existingDoc.status === 'verified' && unchanged)) {
                        existingDoc.expiryDate = expiryDate;
                        existingDoc.status = 'pending';
                        existingDoc.rejectionReason = null;
                        existingDoc.uploadedAt = new Date();
                    }
                    await existingDoc.save();
                } else {
                    await ApplicationDocument.create({
                        applicationId: application._id, employeeRecordId, documentType: dt, deliveryMethod: 'upload',
                        fileUrl, fileName, value: '', expiryDate, uploadedAt: new Date(), status: 'pending',
                    });
                }
            } else {
                const value = typeof sub.value === 'string' ? sanitizeMetadataValue(dt as DocumentType, sub.value.trim()) : '';
                if (!value) continue;
                const fmtError = metadataValueError(dt as DocumentType, value);
                if (fmtError) return NextResponse.json({ error: fmtError }, { status: 400 });
                const unchanged = existingDoc && (existingDoc.value || '') === value;
                if (existingDoc) {
                    existingDoc.deliveryMethod = 'email';
                    existingDoc.fileUrl = '';
                    existingDoc.fileName = '';
                    existingDoc.value = value;
                    if (!(existingDoc.status === 'verified' && unchanged)) {
                        existingDoc.status = 'pending';
                        existingDoc.rejectionReason = null;
                        existingDoc.uploadedAt = new Date();
                    }
                    await existingDoc.save();
                } else {
                    await ApplicationDocument.create({
                        applicationId: application._id, employeeRecordId, documentType: dt, deliveryMethod: 'email',
                        fileUrl: '', fileName: '', value, expiryDate: null, uploadedAt: new Date(), status: 'pending',
                    });
                }
            }
        }

        // ── 3. Consume uploaded assets ───────────────────────────────────────
        const consumedPublicIds: string[] = Array.isArray(body?.uploadedPublicIds)
            ? Array.from(new Set(body.uploadedPublicIds.filter((v: unknown): v is string => typeof v === 'string' && v.trim().length > 0)))
            : [];
        if (consumedPublicIds.length > 0) {
            await UploadAsset.updateMany(
                { publicId: { $in: consumedPublicIds }, status: 'pending' },
                { $set: { status: 'consumed', consumedAt: new Date(), applicationId: application._id } }
            );
        }

        // ── 4. Roll up invite completion ─────────────────────────────────────
        if (submit) {
            const [openResponses, providedDocs] = await Promise.all([
                OnboardingResponse.countDocuments({ applicationId: application._id, assignee: 'applicant', status: { $ne: 'completed' } }),
                ApplicationDocument.find({ applicationId: application._id, documentType: { $in: requirements.map((r) => r.documentType) } }).select('documentType fileUrl value').lean(),
            ]);
            const providedByType = new Map(providedDocs.map((d: any) => [d.documentType, d]));
            const allDocsDone = requirements.every((r) => {
                const d: any = providedByType.get(r.documentType);
                return r.requiresFile ? !!d?.fileUrl : !!(d?.value && String(d.value).trim());
            });
            if (openResponses === 0 && allDocsDone) {
                invite.status = 'completed';
                await invite.save();
            }
        }

        return NextResponse.json({ message: submit ? 'Onboarding submitted' : 'Progress saved' });
    } catch (error: any) {
        console.error('PATCH /api/onboarding/track/[applicationId] error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
