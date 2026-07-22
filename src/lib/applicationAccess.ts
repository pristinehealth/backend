import crypto from 'crypto';
import ApplicationAccessSession from '@/models/ApplicationAccessSession';

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Secret used to sign stateless magic-link access tokens emailed to applicants.
// Falls back to NextAuth's secret so a fresh install works without extra config.
function linkSecret(): string {
  return process.env.APPLICATION_LINK_SECRET || process.env.NEXTAUTH_SECRET || '';
}

// Marks a token as our signed link form (vs. the UUID pair the OTP flow mints).
const LINK_PREFIX = 'lnk_';

/**
 * Mint a stateless, self-expiring access link token for an applicant's email.
 * Stateless by design: applicants may hold several unexpired links (one per
 * update email) at once, and the single-token-per-email DB session can't model
 * that. Returns null when no signing secret is configured (link is then omitted
 * rather than shipping an unverifiable one).
 */
export function createApplicationAccessLinkToken(
  email: string,
  ttlMs = 7 * 24 * 60 * 60 * 1000
): string | null {
  const secret = linkSecret();
  if (!secret) return null;

  const payload = JSON.stringify({
    e: email.trim().toLowerCase(),
    exp: Date.now() + ttlMs,
  });
  const body = Buffer.from(payload).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${LINK_PREFIX}${body}.${sig}`;
}

/** Validate a signed link token against the email and its embedded expiry. */
function verifyApplicationAccessLinkToken(email: string, token: string): boolean {
  const secret = linkSecret();
  if (!secret || !email || !token.startsWith(LINK_PREFIX)) return false;

  const [body, sig] = token.slice(LINK_PREFIX.length).split('.');
  if (!body || !sig) return false;

  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.e !== email.trim().toLowerCase()) return false;
    return typeof payload.exp === 'number' && payload.exp >= Date.now();
  } catch {
    return false;
  }
}

export async function verifyApplicationAccess(email: string, accessToken: string): Promise<boolean> {
  if (!email || !accessToken) return false;

  // Stateless magic-link tokens emailed to applicants on updates — checked
  // first since it needs no DB round-trip.
  if (verifyApplicationAccessLinkToken(email, accessToken.trim())) return true;

  const normalizedEmail = email.trim().toLowerCase();
  const tokenHash = hashToken(accessToken.trim());

  const session = await ApplicationAccessSession.findOne({
    email: normalizedEmail,
    accessTokenHash: tokenHash,
  }).lean();

  if (!session?.accessTokenExpiry) return false;
  return session.accessTokenExpiry >= new Date();
}
