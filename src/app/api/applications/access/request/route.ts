import { NextResponse } from 'next/server';
import crypto from 'crypto';
import dbConnect from '@/lib/mongoose';
import JobApplication from '@/models/JobApplication';
import ApplicationAccessSession from '@/models/ApplicationAccessSession';
import { sendApplicationTrackingOtpEmail } from '@/lib/mailer';
import { rateLimit, clientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Rate limit OTP requests per IP to stop mass abuse / email flooding.
    const ip = clientIp(request);
    const ipBurst = rateLimit(`otp-req:ip:${ip}`, 3, 60_000);
    const ipHourly = rateLimit(`otp-req:iph:${ip}`, 8, 60 * 60_000);
    if (!ipBurst.ok || !ipHourly.ok) {
      const retryAfter = Math.max(ipBurst.retryAfter, ipHourly.retryAfter);
      return NextResponse.json(
        { error: 'Too many code requests — please wait a moment and try again.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    await dbConnect();

    const body = await request.json();
    const email = (body?.email || '').toString().trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Per-email cap: don't let one inbox be spammed with codes, regardless of IP.
    const emailLimit = rateLimit(`otp-req:email:${email}`, 4, 60 * 60_000);
    if (!emailLimit.ok) {
      return NextResponse.json(
        { error: 'Too many codes requested for this email. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(emailLimit.retryAfter) } }
      );
    }

    const hasApplications = await JobApplication.exists({
      applicantEmail: { $regex: new RegExp(`^${email}$`, 'i') },
    });

    if (!hasApplications) {
      return NextResponse.json({ error: 'No applications found for this email' }, { status: 404 });
    }

    const otpCode = crypto.randomInt(100000, 999999).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    await ApplicationAccessSession.findOneAndUpdate(
      { email },
      {
        $set: {
          email,
          otpCode,
          otpExpiry,
          accessTokenHash: null,
          accessTokenExpiry: null,
        },
      },
      { upsert: true, new: true }
    );

    await sendApplicationTrackingOtpEmail(email, otpCode);

    return NextResponse.json({ message: 'Verification code sent to your email.' });
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
