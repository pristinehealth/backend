/**
 * Google reCAPTCHA v3 server-side verification.
 *
 * v3 is invisible and score-based (0.0 = bot … 1.0 = human); there is no user
 * challenge. Env-gated so the app runs without CAPTCHA in dev: if
 * `RECAPTCHA_SECRET_KEY` is unset, verification is skipped (returns true).
 *
 * Configure:
 *   NEXT_PUBLIC_RECAPTCHA_SITE_KEY   (client widget/script)
 *   RECAPTCHA_SECRET_KEY             (server verification)
 *   RECAPTCHA_MIN_SCORE              (optional, default 0.5)
 *
 * Get free v3 keys at https://www.google.com/recaptcha/admin (works on any host).
 */
const VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

/** True if the token verifies and meets the score threshold (or reCAPTCHA is off). */
export async function verifyRecaptcha(token: unknown, ip?: string): Promise<boolean> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return true; // not configured — don't block
  if (typeof token !== 'string' || !token) return false;

  const minScore = Number(process.env.RECAPTCHA_MIN_SCORE) || 0.5;

  try {
    const form = new URLSearchParams();
    form.append('secret', secret);
    form.append('response', token);
    if (ip && ip !== 'unknown') form.append('remoteip', ip);

    const res = await fetch(VERIFY_URL, { method: 'POST', body: form });
    const data = (await res.json()) as {
      success?: boolean; score?: number; action?: string; 'error-codes'?: string[];
    };

    if (!data.success) {
      console.warn('[reCAPTCHA] token rejected', { errors: data['error-codes'] });
      return false;
    }
    const passed = typeof data.score !== 'number' || data.score >= minScore;
    console.log('[reCAPTCHA] verified', {
      score: data.score, minScore, action: data.action, passed,
    });
    return passed;
  } catch (err: any) {
    console.error('[reCAPTCHA] verify failed:', err?.message || err);
    return false;
  }
}
