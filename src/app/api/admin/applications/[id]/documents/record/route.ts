import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import dbConnect from '@/lib/mongoose';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import JobApplication from '@/models/JobApplication';
import ApplicationDocument, { type DocumentType } from '@/models/ApplicationDocument';
import { DOCUMENT_METADATA, getDocumentLabel, usesMetadataOnlyStorage } from '@/lib/documentMetadata';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.role || !['admin', 'superadmin'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    const { id } = await params;

    const body = (await request.json()) as {
      documentType?: DocumentType;
      deliveryMethod?: 'email' | 'upload';
    };

    const documentType = body.documentType;
    if (!documentType || !DOCUMENT_METADATA[documentType]) {
      return NextResponse.json({ error: 'Invalid document type' }, { status: 400 });
    }

    if (!usesMetadataOnlyStorage(documentType)) {
      return NextResponse.json(
        { error: 'Only metadata-only document types can be recorded without files' },
        { status: 400 }
      );
    }

    const application = await JobApplication.findById(id);
    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    const existing = await ApplicationDocument.findOne({
      applicationId: application._id,
      documentType,
    }).sort({ uploadedAt: -1 });

    const deliveryMethod = body.deliveryMethod === 'upload' ? 'upload' : 'email';

    let document;
    if (existing) {
      existing.deliveryMethod = deliveryMethod;
      existing.fileUrl = '';
      existing.fileName = '';
      existing.uploadedAt = new Date();
      existing.status = 'pending';
      existing.rejectionReason = null;
      existing.expiryDate = null;
      document = await existing.save();
    } else {
      document = await ApplicationDocument.create({
        applicationId: application._id,
        documentType,
        deliveryMethod,
        fileUrl: '',
        fileName: '',
        expiryDate: null,
        uploadedAt: new Date(),
        status: 'pending',
      });
    }

    const reviewerName = session.user.name || session.user.email || 'Admin';
    const label = getDocumentLabel(documentType);
    const noteText = `Admin recorded receipt for metadata-only document "${label}".`;

    await JobApplication.findByIdAndUpdate(application._id, {
      $push: {
        notes: {
          author: reviewerName,
          text: noteText,
          createdAt: new Date(),
        },
      },
    });

    return NextResponse.json({
      success: true,
      document,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to record metadata-only document', details: error.message },
      { status: 500 }
    );
  }
}
