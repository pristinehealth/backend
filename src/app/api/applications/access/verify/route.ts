import { NextResponse } from 'next/server';
import crypto from 'crypto';
import dbConnect from '@/lib/mongoose';
import ApplicationAccessSession from '@/models/ApplicationAccessSession';

export const dynamic = 'force-dynamic';

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function POST(request: Request) {
  try {
    await dbConnect();

    const body = await request.json();
    const email = (body?.email || '').toString().trim().toLowerCase();
    const code = (body?.code || '').toString().trim();

    if (!email || !code) {
      return NextResponse.json({ error: 'Email and verification code are required' }, { status: 400 });
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
