import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import dbConnect from '@/lib/mongoose';
import Staff from '@/models/Staff';
import { sendOtpEmail } from '@/lib/mailer';

export async function POST(req: Request) {
    try {
        const { email, password, firstname, lastname } = await req.json();

        if (!email || !password || !firstname || !lastname) {
            return NextResponse.json({ error: 'First name, last name, email, and password are required.' }, { status: 400 });
        }

        if (password.length < 8) {
            return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
        }

        await dbConnect();

        const staff = await Staff.findOne({ email: email.trim().toLowerCase() });

        if (!staff) {
            return NextResponse.json(
                { error: 'No staff account found for this email. Contact your administrator.' },
                { status: 404 }
            );
        }

        if (staff.passwordHash) {
            return NextResponse.json(
                { error: 'An account already exists for this email. Use "Forgot Password" to regain access.' },
                { status: 409 }
            );
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const otpCode = crypto.randomInt(100000, 999999).toString();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

        staff.passwordHash = passwordHash;
        staff.emailVerified = false;
        staff.otpCode = otpCode;
        staff.otpExpiry = otpExpiry;
        if (!staff.firstname) staff.firstname = firstname.trim();
        if (!staff.lastname) staff.lastname = lastname.trim();
        await staff.save();

        await sendOtpEmail(staff.email, otpCode, staff.firstname, 'verification');

        return NextResponse.json({
            success: true,
            message: 'Account created! Check your email for a 6-digit verification code.'
        });

    } catch (error: any) {
        console.error('[Signup] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
