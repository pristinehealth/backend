import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import dbConnect from '@/lib/mongoose';
import User from '@/models/User';
import { clientIp, rateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const MAX_ATTEMPTS = 5;

/**
 * POST /api/auth/reset-password   body: { email, code, newPassword }
 *
 * Step 2 of admin self-service password reset. Verifies the emailed code against
 * the bcrypt hash stored by /forgot-password, enforces a 10-minute expiry and a
 * 5-attempt cap, then sets the new bcrypt-hashed password and clears the reset
 * state. Error messages are deliberately generic (no email enumeration).
 */
export async function POST(req: Request) {
    try {
        const ip = clientIp(req);

        const body = await req.json().catch(() => ({}));
        const email = (typeof body?.email === 'string' ? body.email : '').trim().toLowerCase();
        const code = String(body?.code ?? '').replace(/\D/g, '');
        const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';

        if (!email || !code || !newPassword) {
            return NextResponse.json(
                { error: 'Email, code, and new password are required.' },
                { status: 400 }
            );
        }
        if (newPassword.length < 8) {
            return NextResponse.json(
                { error: 'New password must be at least 8 characters.' },
                { status: 400 }
            );
        }

        // Rate limit the verify step: bounds brute-forcing the 6-digit code.
        const perIp = rateLimit(`reset:ip:${ip}`, 10, 60_000);
        const perEmail = rateLimit(`reset:email:${email}`, 6, 10 * 60_000);
        if (!perIp.ok || !perEmail.ok) {
            const retryAfter = Math.max(perIp.retryAfter, perEmail.retryAfter);
            return NextResponse.json(
                { error: 'Too many attempts. Please try again later.' },
                { status: 429, headers: { 'Retry-After': String(retryAfter) } }
            );
        }

        await dbConnect();

        const user = await User.findOne({ email }).select(
            '+resetOtpHash +resetOtpExpiry +resetOtpAttempts'
        );

        const invalid = () =>
            NextResponse.json({ error: 'Invalid or expired reset code.' }, { status: 401 });

        if (!user || !user.resetOtpHash || !user.resetOtpExpiry) {
            return invalid();
        }
        if (user.resetOtpExpiry < new Date()) {
            return invalid();
        }
        if ((user.resetOtpAttempts ?? 0) >= MAX_ATTEMPTS) {
            // Burn the code so it can't be ground down further; force a new request.
            await User.updateOne(
                { _id: user._id },
                { $unset: { resetOtpHash: '', resetOtpExpiry: '', resetOtpAttempts: '' } }
            );
            return NextResponse.json(
                { error: 'Too many incorrect attempts. Please request a new code.' },
                { status: 401 }
            );
        }

        const matches = await bcrypt.compare(code, user.resetOtpHash);
        if (!matches) {
            await User.updateOne({ _id: user._id }, { $inc: { resetOtpAttempts: 1 } });
            return invalid();
        }

        // Success — set the new password and clear all reset state atomically.
        const passwordHash = await bcrypt.hash(newPassword, 10);
        await User.updateOne(
            { _id: user._id },
            {
                $set: { password: passwordHash },
                $unset: { resetOtpHash: '', resetOtpExpiry: '', resetOtpAttempts: '' },
            }
        );

        console.log(`[Reset-Password] password reset for ${email}`);
        return NextResponse.json({
            success: true,
            message: 'Password reset successfully. You can now sign in.',
        });
    } catch (error: any) {
        console.error('[Reset-Password] Error:', error?.message || error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
