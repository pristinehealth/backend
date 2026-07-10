import crypto from 'crypto';
import ApplicationAccessSession from '@/models/ApplicationAccessSession';

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function verifyApplicationAccess(email: string, accessToken: string): Promise<boolean> {
  if (!email || !accessToken) return false;

  const normalizedEmail = email.trim().toLowerCase();
  const tokenHash = hashToken(accessToken.trim());

  const session = await ApplicationAccessSession.findOne({
    email: normalizedEmail,
    accessTokenHash: tokenHash,
  }).lean();

  if (!session?.accessTokenExpiry) return false;
  return session.accessTokenExpiry >= new Date();
}
