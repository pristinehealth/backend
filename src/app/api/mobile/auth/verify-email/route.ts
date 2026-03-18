import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import dbConnect from '@/lib/mongoose';
import Staff from '@/models/Staff';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret-please-change-in-prod';

export async function POST(req: Request) {
    try {
        const { email, code } = await req.json();

        if (!email || !code) {
            return NextResponse.json({ error: 'Email and verification code are required.' }, { status: 400 });
        }

        await dbConnect();

        const staff = await Staff.findOne({ email: email.trim().toLowerCase() });

        if (!staff || !staff.otpCode || !staff.otpExpiry) {
            return NextResponse.json({ error: 'Invalid or expired verification code.' }, { status: 401 });
        }

        if (staff.otpExpiry < new Date()) {
            return NextResponse.json({ error: 'Verification code has expired. Please request a new one.' }, { status: 401 });
        }

        const cleanCode = String(code).replace(/\D/g, '');

        console.log(`[Verify-Email] DB OTP: "${staff.otpCode}", Passed OTP Raw: "${code}", Cleaned: "${cleanCode}"`);

        if (staff.otpCode !== cleanCode) {
            return NextResponse.json({ error: 'Invalid verification code.' }, { status: 401 });
        }

        staff.emailVerified = true;
        staff.otpCode = undefined;
        staff.otpExpiry = undefined;
        await staff.save();

        const token = jwt.sign(
            { userid: staff.staffid, email: staff.email, role: staff.role, admin: staff.admin },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        return NextResponse.json({
            token,
            user: {
                id: staff.staffid,
                email: staff.email,
                firstname: staff.firstname,
                lastname: staff.lastname,
                role: staff.role,
                admin: staff.admin
            }
        });

    } catch (error: any) {
        console.error('[Verify Email] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
