import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import dbConnect from '@/lib/mongoose';
import ApplicationDocument from '@/models/ApplicationDocument';
import JobApplication from '@/models/JobApplication';
import Staff from '@/models/Staff';
import type { DocumentType } from '@/models/ApplicationDocument';
import { getDocumentLabel } from '@/lib/documentMetadata';
import { linkApplicationDocumentsToStaff } from '@/lib/documentHelpers';
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
    }

    let updatedNotes: any[] | undefined;
    if (action === 'reject') {
      doc.status = 'rejected';
      doc.rejectionReason = rejectionReason || 'Rejected by admin';

      const reviewerName = session.user.name || session.user.email || 'Reviewer';
      const documentLabel = getDocumentLabel(doc.documentType as DocumentType);
      const noteText = `Document "${documentLabel}" was rejected. Reason: ${doc.rejectionReason}.`;

      const updatedApp = await JobApplication.findByIdAndUpdate(
        doc.applicationId,
        { $push: { notes: { author: reviewerName, text: noteText, createdAt: new Date() } } },
        { returnDocument: 'after' }
      ).select('notes').lean();
      updatedNotes = (updatedApp as any)?.notes;
    }

    await doc.save();

    // If this document was verified AFTER the application was already accepted
    // (e.g. an onboarding-link upload), materialize it into the staff compliance
    // record now — the accept-time link only ran for docs verified by then.
    // Idempotent + verified-only, so re-running is safe. Best-effort.
    if (doc.status === 'verified') {
      try {
        const application = await JobApplication.findById(doc.applicationId).select('status applicantEmail').lean();
        if ((application as any)?.status === 'accepted') {
          const email = (application as any).applicantEmail as string;
          const staff = await Staff.findOne({ email: { $regex: new RegExp(`^${email.trim()}$`, 'i') } }).select('staffid').lean();
          await linkApplicationDocumentsToStaff(String(doc.applicationId), email, (staff as any)?.staffid);
        }
      } catch (linkErr: any) {
        console.error('[Document Verify] post-accept staff materialization failed:', linkErr?.message || linkErr);
      }
    }

    return NextResponse.json(
      {
        success: true,
        document: {
          id: doc._id,
          status: doc.status,
          expiryDate: doc.expiryDate,
          rejectionReason: doc.rejectionReason,
        },
        // Present on reject: the application's notes now include the rejection
        // note, so the admin's notes view can update without a refetch.
        ...(updatedNotes ? { notes: updatedNotes } : {}),
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
