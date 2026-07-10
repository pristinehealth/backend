import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import dbConnect from '@/lib/mongoose';
import ApplicationDocument from '@/models/ApplicationDocument';
import JobApplication from '@/models/JobApplication';
import type { DocumentType } from '@/models/ApplicationDocument';
import { getDocumentLabel } from '@/lib/documentMetadata';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.role || !['admin', 'superadmin'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    const { docId } = await params;
    const body = await request.json() as {
      action: string;
      rejectionReason?: string;
      expiryDate?: string | null;
      reviewIntervalDays?: number;
    };
    const { action, rejectionReason, expiryDate, reviewIntervalDays } = body;

    if (!['verify', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be "verify" or "reject".' },
        { status: 400 }
      );
    }

    const doc = await ApplicationDocument.findById(docId);
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (action === 'verify') {
      let nextExpiry: Date | null = doc.expiryDate || null;
      if (typeof expiryDate === 'string' && expiryDate.trim()) {
        const parsed = new Date(expiryDate);
        if (Number.isNaN(parsed.getTime())) {
          return NextResponse.json({ error: 'Invalid expiryDate value' }, { status: 400 });
        }
        nextExpiry = parsed;
      } else if (typeof reviewIntervalDays === 'number' && Number.isFinite(reviewIntervalDays) && reviewIntervalDays > 0) {
        const next = new Date();
        next.setDate(next.getDate() + Math.floor(reviewIntervalDays));
        nextExpiry = next;
      }

      doc.expiryDate = nextExpiry;

      if (nextExpiry) {
        const today = new Date();
        const nowDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const expDay = new Date(nextExpiry.getFullYear(), nextExpiry.getMonth(), nextExpiry.getDate());
        doc.status = expDay < nowDay ? 'expired' : 'verified';
      } else {
        doc.status = 'verified';
      }

      doc.rejectionReason = null;
    } else {
      doc.status = 'rejected';
      doc.rejectionReason = rejectionReason || 'Rejected by admin';

      const reviewerName = session.user.name || session.user.email || 'Reviewer';
      const documentLabel = getDocumentLabel(doc.documentType as DocumentType);
      const noteText = `Document "${documentLabel}" was rejected. Reason: ${doc.rejectionReason}.`;

      await JobApplication.findByIdAndUpdate(doc.applicationId, {
        $push: {
          notes: {
            author: reviewerName,
            text: noteText,
            createdAt: new Date(),
          },
        },
      });
    }

    await doc.save();

    return NextResponse.json(
      {
        success: true,
        document: {
          id: doc._id,
          status: doc.status,
          expiryDate: doc.expiryDate,
          rejectionReason: doc.rejectionReason,
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('[Document Verify] Error:', err?.message || err);
    return NextResponse.json(
      { error: err?.message || 'Failed to verify document' },
      { status: 500 }
    );
  }
}
