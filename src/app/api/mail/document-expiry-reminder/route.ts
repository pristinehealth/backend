import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import { sendDocumentExpiryReminder } from '@/lib/mailer';
import { getDocumentLabel } from '@/lib/documentMetadata';

export async function POST(request: Request) {
  try {
    // This endpoint is called by the cron job, not from client
    // Verify it's coming from a trusted source (localhost or internal)
    const origin = request.headers.get('origin') || '';
    const isInternal = origin.includes('localhost') || origin.includes('127.0.0.1') || 
                       (process.env.NEXTAUTH_URL && origin.includes(new URL(process.env.NEXTAUTH_URL).hostname));
    
    if (!isInternal && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await dbConnect();

    const body = await request.json() as {
      to: string;
      staffName: string;
      documentType: string;
      expiryDate: string;
      daysUntilExpiry: number;
    };

    const {
      to,
      staffName,
      documentType,
      expiryDate,
      daysUntilExpiry,
    } = body;

    if (!to || !staffName || !documentType || !expiryDate) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const documentLabel = getDocumentLabel(documentType as any);
    const expiryDateObj = new Date(expiryDate);

    await sendDocumentExpiryReminder(
      to,
      staffName,
      documentLabel,
      expiryDateObj,
      daysUntilExpiry
    );

    return NextResponse.json(
      {
        success: true,
        message: `Reminder sent to ${to}`,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('[Document Expiry Mail] Error:', err?.message || err);
    return NextResponse.json(
      { error: err?.message || 'Failed to send reminder' },
      { status: 500 }
    );
  }
}
