import { NextResponse } from 'next/server';
import { sendContactEmail } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Public contact form → email. No auth (marketing page). Validates input,
 * silently absorbs honeypot-tripped bot submissions, and forwards genuine
 * messages to the support inbox via Resend.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));

        // Honeypot: real users never fill `company` (hidden field). If set, it's a
        // bot — pretend success so it doesn't retry, but send nothing.
        if (typeof body?.company === 'string' && body.company.trim() !== '') {
            return NextResponse.json({ success: true });
        }

        const name = String(body?.name ?? '').trim();
        const email = String(body?.email ?? '').trim();
        const phone = String(body?.phone ?? '').trim();
        const inquiryType = String(body?.inquiryType ?? '').trim();
        const message = String(body?.message ?? '').trim();

        if (!name || !email || !message) {
            return NextResponse.json({ error: 'Please provide your name, email, and a message.' }, { status: 400 });
        }
        if (!EMAIL_RE.test(email)) {
            return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
        }
        if (name.length > 120 || phone.length > 40 || message.length > 5000) {
            return NextResponse.json({ error: 'One of your fields is too long.' }, { status: 400 });
        }

        await sendContactEmail({ name, email, phone, inquiryType, message });
        console.log('[Contact] inquiry accepted', { email, inquiryType: inquiryType || 'General' });
        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error('[Contact] failed:', err?.message || err);
        return NextResponse.json(
            { error: 'Could not send your message right now. Please try again or email us directly.' },
            { status: 500 }
        );
    }
}
