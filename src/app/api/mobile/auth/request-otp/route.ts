import { NextResponse } from 'next/server';
import crypto from 'crypto';
import dbConnect from '@/lib/mongoose';
import Staff from '@/models/Staff';
import { sendOtpEmail } from '@/lib/mailer';

export async function POST(req: Request) {
    try {
        const { email, purpose = 'reset' } = await req.json();

        if (!email) {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }

        await dbConnect();

        const staff = await Staff.findOne({ email: email.trim().toLowerCase() });

        if (!staff) {
            return NextResponse.json({ message: 'If an account with that email exists, a code has been sent.' });
        }

        const otpCode = crypto.randomInt(100000, 999999).toString();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

        staff.otpCode = otpCode;
        staff.otpExpiry = otpExpiry;
        await staff.save();

        await sendOtpEmail(staff.email, otpCode, staff.firstname, purpose);

        return NextResponse.json({ message: 'If an account with that email exists, a code has been sent.' });

    } catch (error: any) {
        console.error('OTP Request Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
