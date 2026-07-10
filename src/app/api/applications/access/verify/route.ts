import { NextResponse } from 'next/server';
import crypto from 'crypto';
import dbConnect from '@/lib/mongoose';
import ApplicationAccessSession from '@/models/ApplicationAccessSession';
import { rateLimit, clientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function POST(request: Request) {
  try {
    // Rate limit verification attempts — the key defense against brute-forcing
    // the 6-digit code (alongside code expiry).
    const ip = clientIp(request);
    const ipBurst = rateLimit(`otp-vfy:ip:${ip}`, 10, 60_000);
    if (!ipBurst.ok) {
      return NextResponse.json(
        { error: 'Too many attempts — please wait a moment and try again.' },
        { status: 429, headers: { 'Retry-After': String(ipBurst.retryAfter) } }
      );
    }

    await dbConnect();

    const body = await request.json();
    const email = (body?.email || '').toString().trim().toLowerCase();
    const code = (body?.code || '').toString().trim();

    if (!email || !code) {
      return NextResponse.json({ error: 'Email and verification code are required' }, { status: 400 });
    }

    // Per-email attempt cap: at most a handful of code guesses per window.
    const emailLimit = rateLimit(`otp-vfy:email:${email}`, 6, 10 * 60_000);
    if (!emailLimit.ok) {
      return NextResponse.json(
        { error: 'Too many verification attempts for this email. Please request a new code later.' },
        { status: 429, headers: { 'Retry-After': String(emailLimit.retryAfter) } }
      );
    }

    const session = await ApplicationAccessSession.findOne({ email });
    if (!session || !session.otpCode || !session.otpExpiry) {
      return NextResponse.json({ error: 'Invalid or expired verification code' }, { status: 401 });
    }

    if (session.otpExpiry < new Date() || session.otpCode !== code) {
      return NextResponse.json({ error: 'Invalid or expired verification code' }, { status: 401 });
    }

    const accessToken = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
    const accessTokenHash = hashToken(accessToken);
    const accessTokenExpiry = new Date(Date.now() + 30 * 60 * 1000);

    session.otpCode = undefined;
    session.otpExpiry = undefined;
    session.accessTokenHash = accessTokenHash;
    session.accessTokenExpiry = accessTokenExpiry;
    await session.save();

    return NextResponse.json({
      accessToken,
      expiresAt: accessTokenExpiry.toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
