import { createApplicationAccessLinkToken } from '@/lib/applicationAccess';

// Default onboarding link/invite window. The signed token's TTL is set to match
// so the token and the invite record expire together.
export const ONBOARDING_INVITE_TTL_DAYS = 14;
export const ONBOARDING_INVITE_TTL_MS = ONBOARDING_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;

/**
 * Deep link to an applicant's onboarding self-service page, pre-authenticated
 * with a signed access token whose TTL matches the invite window. Returns
 * undefined when no signing secret is configured (caller surfaces an error
 * rather than sending a dead link). Mirrors buildTrackingUrl in the status route.
 */
export function buildOnboardingUrl(
    applicationId: string,
    email: string,
    ttlMs: number = ONBOARDING_INVITE_TTL_MS
): string | undefined {
    const token = createApplicationAccessLinkToken(email, ttlMs);
    if (!token) return undefined;
    const base = (process.env.PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '');
    return `${base}/onboarding/${applicationId}?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
}

/**
 * Deep link to a person's record-based onboarding page (Phase 3 — a staff member
 * with no application). Same signed, email-scoped token as the applicant link;
 * the route is keyed on the EmployeeRecord id instead of an application id.
 */
export function buildOnboardingUrlForRecord(
    employeeRecordId: string,
    email: string,
    ttlMs: number = ONBOARDING_INVITE_TTL_MS
): string | undefined {
    const token = createApplicationAccessLinkToken(email, ttlMs);
    if (!token) return undefined;
    const base = (process.env.PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '');
    return `${base}/onboarding/r/${employeeRecordId}?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
}
