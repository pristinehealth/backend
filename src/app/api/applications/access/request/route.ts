import { NextResponse } from 'next/server';
import crypto from 'crypto';
import dbConnect from '@/lib/mongoose';
import JobApplication from '@/models/JobApplication';
import ApplicationAccessSession from '@/models/ApplicationAccessSession';
import { sendApplicationTrackingOtpEmail } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    await dbConnect();

    const body = await request.json();
    const email = (body?.email || '').toString().trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
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
