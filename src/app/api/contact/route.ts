import { NextResponse } from 'next/server';
import { sendContactEmail } from '@/lib/mailer';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { verifyRecaptcha } from '@/lib/recaptcha';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /https?:\/\//gi;

// Bots that trip a silent trap get a fake success so they don't learn/retry.
const SILENT_OK = NextResponse.json({ success: true });

/**
 * Public contact form → email. No auth (marketing page). Layered anti-spam:
 *  1. Rate limiting per IP (short burst + hourly cap).
 *  2. Honeypot field (`company`) — real users never fill it.
 *  3. Time-trap (`renderedAt`) — reject inhumanly fast / stale submits.
 *  4. Link-flood heuristic — messages stuffed with URLs are dropped.
 *  5. Field validation (required, email format, length caps).
 * Genuine messages are forwarded to the support inbox via Resend.
 */
export async function POST(request: Request) {
    try {
        const ip = clientIp(request);

        // 1) Rate limit: max 3 / minute and 10 / hour per IP.
        const burst = rateLimit(`contact:min:${ip}`, 3, 60_000);
        const hourly = rateLimit(`contact:hr:${ip}`, 10, 60 * 60_000);
        if (!burst.ok || !hourly.ok) {
            const retryAfter = Math.max(burst.retryAfter, hourly.retryAfter);
            console.warn('[Contact] rate limited', { ip, retryAfter });
            return NextResponse.json(
                { error: "You've sent a few messages already — please try again shortly." },
                { status: 429, headers: { 'Retry-After': String(retryAfter) } }
            );
        }

        const body = await request.json().catch(() => ({}));

        // 2) Honeypot: hidden `company` field. Filled = bot.
        if (typeof body?.company === 'string' && body.company.trim() !== '') {
            console.warn('[Contact] honeypot tripped', { ip });
            return SILENT_OK;
        }

        // 3) Time-trap: the form stamps `renderedAt` (ms) on load. Humans take a
        // few seconds; bots post instantly (or omit it). Reject <3s and >2h.
        const renderedAt = Number(body?.renderedAt);
        const elapsed = Number.isFinite(renderedAt) ? Date.now() - renderedAt : NaN;
        if (!Number.isFinite(elapsed) || elapsed < 3_000 || elapsed > 2 * 60 * 60_000) {
            console.warn('[Contact] time-trap tripped', { ip, elapsed });
            return SILENT_OK;
        }

        const name = String(body?.name ?? '').trim();
        const email = String(body?.email ?? '').trim();
        const phone = String(body?.phone ?? '').trim();
        const inquiryType = String(body?.inquiryType ?? '').trim();
        const message = String(body?.message ?? '').trim();

        // 5) Validation.
        if (!name || !email || !message) {
            return NextResponse.json({ error: 'Please provide your name, email, and a message.' }, { status: 400 });
        }
        if (!EMAIL_RE.test(email)) {
            return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
        }
        if (name.length > 120 || phone.length > 40 || message.length > 5000) {
            return NextResponse.json({ error: 'One of your fields is too long.' }, { status: 400 });
        }

        // 6) CAPTCHA (Google reCAPTCHA v3) — the strong bot gate. Skipped when
        // not configured; required once RECAPTCHA_SECRET_KEY is set.
        if (!(await verifyRecaptcha(body?.recaptchaToken, ip))) {
            return NextResponse.json({ error: 'Verification failed — please try again.' }, { status: 400 });
        }

        // 4) Link-flood heuristic: legit inquiries rarely contain many links.
        const linkCount = (message.match(URL_RE) || []).length;
        if (linkCount > 4) {
            console.warn('[Contact] link-flood dropped', { ip, linkCount });
            return SILENT_OK;
        }

        await sendContactEmail({ name, email, phone, inquiryType, message });
        console.log('[Contact] inquiry accepted', { ip, email, inquiryType: inquiryType || 'General' });
        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error('[Contact] failed:', err?.message || err);
        return NextResponse.json(
            { error: 'Could not send your message right now. Please try again or email us directly.' },
            { status: 500 }
        );
    }
}
