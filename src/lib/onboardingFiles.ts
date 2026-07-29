// Same idea as applicationFiles.ts, but for the onboarding self-service page:
// client-facing references to submitted files point at our own streaming proxy
// (`/api/onboarding/track/<applicationId>/file`) so the underlying storage URL
// never reaches the browser.

// A supporting document (ApplicationDocument) by its id.
export function buildOnboardingDocumentFileRef(applicationId: string, documentId: string, cred: string): string {
    return `/api/onboarding/track/${applicationId}/file?documentId=${encodeURIComponent(documentId)}&${cred}`;
}

// A questionnaire file ANSWER (lives in OnboardingResponse.answers[field]).
export function buildOnboardingAnswerFileRef(applicationId: string, responseId: string, field: string, cred: string): string {
    return `/api/onboarding/track/${applicationId}/file?responseId=${encodeURIComponent(responseId)}&field=${encodeURIComponent(field)}&${cred}`;
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
