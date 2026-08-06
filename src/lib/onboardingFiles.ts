// Same idea as applicationFiles.ts, but for the onboarding self-service page:
// client-facing references to submitted files point at our own streaming proxy
// so the underlying storage URL never reaches the browser. `basePath` is the
// path segment identifying the subject and its file route — either an
// applicationId (`/api/onboarding/track/<applicationId>/file`) or, for a staff
// record onboarding, `by-record/<recordId>` (Phase 3).

// A supporting document (ApplicationDocument) by its id.
export function buildOnboardingDocumentFileRef(basePath: string, documentId: string, cred: string): string {
    return `/api/onboarding/track/${basePath}/file?documentId=${encodeURIComponent(documentId)}&${cred}`;
}

// A questionnaire file ANSWER (lives in OnboardingResponse.answers[field]).
export function buildOnboardingAnswerFileRef(basePath: string, responseId: string, field: string, cred: string): string {
    return `/api/onboarding/track/${basePath}/file?responseId=${encodeURIComponent(responseId)}&field=${encodeURIComponent(field)}&${cred}`;
}

// True when a value is one of our onboarding proxy refs (rather than a real
// storage URL or a fresh-upload publicId). On save the client echoes back the
// ref for an unchanged file — this is how the server tells "keep existing" from
// "replace it" without trusting the client with the stored URL.
export function isOnboardingFileProxyRef(value: unknown): value is string {
    return typeof value === 'string'
        && value.includes('/api/onboarding/track/')
        && value.includes('/file?');
}
