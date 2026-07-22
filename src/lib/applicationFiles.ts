// Client-facing references to submitted files point at our own same-origin
// streaming proxy (`/api/applications/track/<id>/file`) rather than the
// underlying Cloudinary URL — so the storage endpoint never reaches the browser
// (not in the address bar, a new tab, the API payload, or the network log).

// Query the proxy for a supporting document (ApplicationDocument) by its id.
export function buildDocumentFileRef(applicationId: string, documentId: string, cred: string): string {
    return `/api/applications/track/${applicationId}/file?documentId=${encodeURIComponent(documentId)}&${cred}`;
}

// Query the proxy for a custom-field file upload by the field's name.
export function buildFieldFileRef(applicationId: string, fieldName: string, cred: string): string {
    return `/api/applications/track/${applicationId}/file?field=${encodeURIComponent(fieldName)}&${cred}`;
}

/**
 * True when a value is one of our proxy refs (rather than a real storage URL).
 * On save the client echoes back the ref for an unchanged file and a fresh
 * storage URL for a newly uploaded one, so this is how the server tells "keep
 * the existing file" from "replace it" without ever trusting the client with
 * the stored URL.
 */
export function isFileProxyRef(value: unknown): value is string {
    return typeof value === 'string'
        && value.includes('/api/applications/track/')
        && value.includes('/file?');
}
