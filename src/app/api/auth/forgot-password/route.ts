import { NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import dbConnect from '@/lib/mongoose';
import User from '@/models/User';
import { sendOtpEmail } from '@/lib/mailer';
import { clientIp, rateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/forgot-password   body: { email }
 *
 * Step 1 of admin self-service password reset. Emails a 6-digit code to a
 * matching admin/superadmin. The response is ALWAYS the same generic message so
 * this endpoint can't be used to enumerate which emails have accounts. The code
 * is stored bcrypt-hashed with a 10-minute expiry; requesting again overwrites
 * the previous code and resets the attempt counter.
 */
export async function POST(req: Request) {
    const generic = NextResponse.json({
        message: 'If an account with that email exists, a reset code has been sent.',
    });

    try {
        const ip = clientIp(req);
        // Layered limits: burst per IP, sustained per IP, and per-email so one
        // address can't be spammed with reset emails.
        const perIpMin = rateLimit(`forgot:ip:min:${ip}`, 3, 60_000);
        const perIpHr = rateLimit(`forgot:ip:hr:${ip}`, 8, 60 * 60_000);
        if (!perIpMin.ok || !perIpHr.ok) {
            const retryAfter = Math.max(perIpMin.retryAfter, perIpHr.retryAfter);
            return NextResponse.json(
                { error: 'Too many requests. Please try again later.' },
                { status: 429, headers: { 'Retry-After': String(retryAfter) } }
            );
        }

        const body = await req.json().catch(() => ({}));
        const rawEmail = typeof body?.email === 'string' ? body.email : '';
        const email = rawEmail.trim().toLowerCase();
        if (!email) {
            return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
        }

        const perEmail = rateLimit(`forgot:email:${email}`, 4, 60 * 60_000);
        if (!perEmail.ok) {
            // Still generic — don't reveal whether this email exists.
            return generic;
        }

        await dbConnect();

        const user = await User.findOne({ email });
        // No account → return the same generic message (no enumeration).
        if (!user) {
            console.log(`[Forgot-Password] no account for ${email} (generic response)`);
            return generic;
        }

        const code = crypto.randomInt(100000, 999999).toString();
        const codeHash = await bcrypt.hash(code, 10);

        await User.updateOne(
            { _id: user._id },
            {
                $set: {
                    resetOtpHash: codeHash,
                    resetOtpExpiry: new Date(Date.now() + 10 * 60 * 1000),
                    resetOtpAttempts: 0,
                },
            }
        );

        await sendOtpEmail(user.email, code, user.name || 'there', 'reset');
        console.log(`[Forgot-Password] reset code issued to ${email}`);

        return generic;
    } catch (error: any) {
        console.error('[Forgot-Password] Error:', error?.message || error);
        // Even on error, avoid leaking anything — return the generic message so
        // the flow (and enumeration resistance) stays consistent.
        return generic;
    }
}
