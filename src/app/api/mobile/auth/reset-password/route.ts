import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import dbConnect from '@/lib/mongoose';
import Staff from '@/models/Staff';

export async function POST(req: Request) {
    try {
        const { email, code, newPassword } = await req.json();

        if (!email || !code || !newPassword) {
            return NextResponse.json({ error: 'Email, code, and new password are required.' }, { status: 400 });
        }

        if (newPassword.length < 8) {
            return NextResponse.json({ error: 'New password must be at least 8 characters.' }, { status: 400 });
        }

        await dbConnect();

        const staff = await Staff.findOne({ email: email.trim().toLowerCase() });

        if (!staff || !staff.otpCode || !staff.otpExpiry) {
            return NextResponse.json({ error: 'Invalid or expired reset code.' }, { status: 401 });
        }

        if (staff.otpExpiry < new Date()) {
            return NextResponse.json({ error: 'Reset code has expired. Please request a new one.' }, { status: 401 });
        }

        if (staff.otpCode !== code) {
            return NextResponse.json({ error: 'Invalid reset code.' }, { status: 401 });
        }

        staff.passwordHash = await bcrypt.hash(newPassword, 10);
        staff.emailVerified = true;
        staff.otpCode = undefined;
        staff.otpExpiry = undefined;
        await staff.save();

        return NextResponse.json({ success: true, message: 'Password reset successfully. You can now log in.' });

    } catch (error: any) {
        console.error('[Reset Password] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
