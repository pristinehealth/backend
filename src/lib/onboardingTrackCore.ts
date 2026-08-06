// Shared orchestration for the onboarding self-service track API, keyed on an
// abstract "subject" so it serves both an applicant (by applicationId) and a
// staff member with no application (by employeeRecordId — Phase 3). The two thin
// route handlers resolve their subject, load + validate the invite, then delegate
// the GET payload build and the PATCH save here.

import OnboardingForm from '@/models/OnboardingForm';
import OnboardingResponse from '@/models/OnboardingResponse';
import ApplicationDocument, { type DocumentType } from '@/models/ApplicationDocument';
import UploadAsset from '@/models/UploadAsset';
import { getComplianceRequirements } from '@/lib/compliance';
import { validateAnswers } from '@/lib/onboardingAnswers';
import { resolveFileReference } from '@/lib/uploadResolve';
import { requiresFileUpload, metadataValueError, sanitizeMetadataValue, getDocumentLabel } from '@/lib/documentMetadata';
import {
    buildOnboardingAnswerFileRef,
    buildOnboardingDocumentFileRef,
    isOnboardingFileProxyRef,
} from '@/lib/onboardingFiles';

export interface RequestedRequirement {
    documentType: string;
    label: string;
    required: boolean;
    requiresFile: boolean;
    storageMode: 'file' | 'metadata_only';
    requiresExpiry: boolean;
}

// The subject an onboarding session is scoped to. `fileBasePath` is the path
// segment for file-proxy refs (an applicationId, or `by-record/<recordId>`);
// `ownerFilter` selects this subject's responses/documents; `docOwner` is stamped
// on any ApplicationDocument created.
export interface TrackSubject {
    fileBasePath: string;
    ownerFilter: Record<string, any>;
    docOwner: { applicationId?: any; employeeRecordId?: any };
    applicantName: string;
    applicantEmail: string;
    jobTitle: string;
}

// Resolve the invite's requested requirement keys against the live catalog.
// Requested items are treated as required to complete the invite.
export async function resolveRequestedRequirements(keys: string[]): Promise<RequestedRequirement[]> {
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

export function inviteValidity(invite: any): { valid: boolean; reason?: 'missing' | 'revoked' | 'expired' } {
    if (!invite) return { valid: false, reason: 'missing' };
    if (invite.status === 'revoked') return { valid: false, reason: 'revoked' };
    if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) return { valid: false, reason: 'expired' };
    if (invite.status !== 'active' && invite.status !== 'completed') return { valid: false, reason: 'expired' };
    return { valid: true };
}

// Build the GET payload for a valid subject + invite.
export async function buildOnboardingTrackPayload(subject: TrackSubject, invite: any, cred: string) {
    const responses = await OnboardingResponse.find({ ...subject.ownerFilter, assignee: 'applicant' })
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
                ? buildOnboardingAnswerFileRef(subject.fileBasePath, String(r._id), k, cred)
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

    const requirements = await resolveRequestedRequirements(invite.requestedDocumentKeys || []);
    const rawDocs = requirements.length
        ? await ApplicationDocument.find({ ...subject.ownerFilter, documentType: { $in: requirements.map((r) => r.documentType) } })
            .select('documentType deliveryMethod fileName fileUrl value expiryDate status uploadedAt rejectionReason')
            .lean()
        : [];
    const documents = rawDocs.map((doc: any) => ({
        ...doc,
        fileUrl: doc.fileUrl ? buildOnboardingDocumentFileRef(subject.fileBasePath, String(doc._id), cred) : '',
    }));

    return {
        valid: true as const,
        applicantName: subject.applicantName,
        applicantEmail: subject.applicantEmail,
        jobTitle: subject.jobTitle,
        expiresAt: invite.expiresAt,
        questionnaires,
        requirements,
        documents,
    };
}

// Apply a save/submit for a valid subject + invite. Returns an HTTP status + body
// for the route to relay. Mutates the invite's status on completed submit.
export async function applyOnboardingTrackPatch(
    subject: TrackSubject,
    invite: any,
    body: any,
    submit: boolean
): Promise<{ status: number; body: any }> {
    // ── 1. Questionnaire answers ─────────────────────────────────────────────
    const responseInputs: Array<{ responseId: string; answers: Record<string, any> }> =
        Array.isArray(body?.responses) ? body.responses : [];

    for (const input of responseInputs) {
        const responseDoc = await OnboardingResponse.findOne({
            _id: input.responseId,
            ...subject.ownerFilter,
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
        if (validation.error) return { status: 400, body: { error: validation.error } };

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

    // ── 2. Requested compliance documents ────────────────────────────────────
    const requirements = await resolveRequestedRequirements(invite.requestedDocumentKeys || []);
    const requiresFileByType = new Map(requirements.map((r) => [r.documentType, r.requiresFile]));
    const docIsFile = (dt: string) =>
        requiresFileByType.has(dt) ? !!requiresFileByType.get(dt) : requiresFileUpload(dt as DocumentType);

    const submittedDocs: any[] = Array.isArray(body?.documents) ? body.documents : [];
    const submittedByType = new Map(submittedDocs.filter((d) => d?.documentType).map((d) => [String(d.documentType), d]));

    if (submit) {
        for (const req of requirements) {
            if (!req.required) continue;
            const sub = submittedByType.get(req.documentType);
            const existingDoc = await ApplicationDocument.findOne({ ...subject.ownerFilter, documentType: req.documentType }).select('fileUrl value').lean();
            if (req.requiresFile) {
                const hasNew = sub && (isOnboardingFileProxyRef(sub.fileUrl) || (typeof (sub.publicId || sub.fileUrl) === 'string' && (sub.publicId || sub.fileUrl)));
                const hasExisting = !!(existingDoc as any)?.fileUrl;
                if (!hasNew && !hasExisting) return { status: 400, body: { error: `Please upload the required ${req.label}` } };
            } else {
                const value = (sub && typeof sub.value === 'string' && sub.value.trim()) || (existingDoc as any)?.value || '';
                if (!value) return { status: 400, body: { error: `Please provide the required ${req.label}` } };
                const fmtError = metadataValueError(req.documentType as DocumentType, value.trim());
                if (fmtError) return { status: 400, body: { error: fmtError } };
            }
        }
    }

    // Upsert each provided document (never delete — onboarding saves are additive).
    for (const sub of submittedDocs) {
        if (!sub?.documentType) continue;
        const dt = String(sub.documentType);
        const isFile = docIsFile(dt);
        const existingDoc = await ApplicationDocument.findOne({ ...subject.ownerFilter, documentType: dt });

        if (isFile) {
            let fileUrl = '';
            if (isOnboardingFileProxyRef(sub.fileUrl)) fileUrl = existingDoc?.fileUrl || '';
            else if (typeof (sub.publicId || sub.fileUrl) === 'string' && (sub.publicId || sub.fileUrl)) fileUrl = await resolveFileReference(sub.publicId || sub.fileUrl);
            if (!fileUrl) continue;
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
                    ...subject.docOwner, documentType: dt, deliveryMethod: 'upload',
                    fileUrl, fileName, value: '', expiryDate, uploadedAt: new Date(), status: 'pending',
                });
            }
        } else {
            const value = typeof sub.value === 'string' ? sanitizeMetadataValue(dt as DocumentType, sub.value.trim()) : '';
            if (!value) continue;
            const fmtError = metadataValueError(dt as DocumentType, value);
            if (fmtError) return { status: 400, body: { error: fmtError } };
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
                    ...subject.docOwner, documentType: dt, deliveryMethod: 'email',
                    fileUrl: '', fileName: '', value, expiryDate: null, uploadedAt: new Date(), status: 'pending',
                });
            }
        }
    }

    // ── 3. Consume uploaded assets ───────────────────────────────────────────
    const consumedPublicIds: string[] = Array.isArray(body?.uploadedPublicIds)
        ? Array.from(new Set(body.uploadedPublicIds.filter((v: unknown): v is string => typeof v === 'string' && v.trim().length > 0)))
        : [];
    if (consumedPublicIds.length > 0) {
        await UploadAsset.updateMany(
            { publicId: { $in: consumedPublicIds }, status: 'pending' },
            { $set: { status: 'consumed', consumedAt: new Date(), ...(subject.docOwner.applicationId ? { applicationId: subject.docOwner.applicationId } : {}) } }
        );
    }

    // ── 4. Roll up invite completion ─────────────────────────────────────────
    if (submit) {
        const [openResponses, providedDocs] = await Promise.all([
            OnboardingResponse.countDocuments({ ...subject.ownerFilter, assignee: 'applicant', status: { $ne: 'completed' } }),
            ApplicationDocument.find({ ...subject.ownerFilter, documentType: { $in: requirements.map((r) => r.documentType) } }).select('documentType fileUrl value').lean(),
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

    return { status: 200, body: { message: submit ? 'Onboarding submitted' : 'Progress saved' } };
}
