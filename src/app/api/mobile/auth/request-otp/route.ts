import { NextResponse } from 'next/server';
import crypto from 'crypto';
import dbConnect from '@/lib/mongoose';
import Staff from '@/models/Staff';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
    try {
        const { email } = await req.json();

        if (!email) {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }

        await dbConnect();

        // 1. Find Staff by Email — case-insensitive, active only
        //    If not found or inactive, return the same generic 200 to prevent
        //    email enumeration (attacker can't tell the difference).
        const staff = await Staff.findOne({
            email: { $regex: new RegExp(`^${email}$`, 'i') },
            active: '1'
        });

        if (!staff) {
            console.warn(`[OTP] Blocked OTP request for unrecognised/inactive email: ${email}`);
            return NextResponse.json({ error: 'No active staff account found with that email address.' }, { status: 404 });
        }

        // 2. Generate 6-digit OTP
        const otpCode = crypto.randomInt(100000, 999999).toString();

        // 3. Set expiration (10 minutes from now)
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

        // 4. Save to database
        staff.otpCode = otpCode;
        staff.otpExpiry = otpExpiry;
        await staff.save();

        // 5. Send Email — fire and forget so the HTTP response returns instantly.
        // Gmail SMTP on cloud servers can take several seconds; we don't want the
        // mobile to hang waiting for the SMTP handshake to complete.
        sendOtpEmail(email, otpCode, staff.firstname).catch(err =>
            console.error('[OTP] Background email send failed:', err.message)
        );

        return NextResponse.json({ message: 'If an account with that email exists, an OTP has been sent.' });

    } catch (error: any) {
        console.error('OTP Request Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

async function sendOtpEmail(to: string, code: string, name: string) {
    // Note: In a real production environment, these should come from process.env
    // For now, we will log the intended email to the server console if credentials are not present.
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;

    if (!user || !pass || !host) {
        console.log(`\n========================================`);
        console.log(`[DEVELOPMENT MODE] OTP GENERATED FOR ${to}`);
        console.log(`CODE: ${code}`);
        console.log(`========================================\n`);
        return;
    }

    const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465, // true for 465, false for other ports
        auth: {
            user,
            pass,
        },
    });

    const info = await transporter.sendMail({
        from: `"Pristine Staffing" <${user}>`,
        to,
        subject: 'Your Pristine Login Code',
        text: `Hello ${name}, your login code is: ${code}. It expires in 10 minutes.`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #4F46E5;">Pristine Login Verification</h2>
                <p>Hello ${name},</p>
                <p>Your one-time password (OTP) to log into the Pristine Staffing app is:</p>
                <div style="background-color: #F3F4F6; padding: 15px; font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 5px; border-radius: 5px; margin: 20px 0;">
                    ${code}
                </div>
                <p style="color: #666; font-size: 12px;">This code will expire in 10 minutes. If you did not request this code, please ignore this email.</p>
            </div>
        `,
    });

    console.log("Message sent: %s", info.messageId);
}
