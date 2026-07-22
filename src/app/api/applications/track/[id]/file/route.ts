import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import JobApplication from '@/models/JobApplication';
import ApplicationDocument from '@/models/ApplicationDocument';
import { verifyApplicationAccess } from '@/lib/applicationAccess';
import { signedFetchUrl } from '@/lib/cloudinary';

export const dynamic = 'force-dynamic';

// Streams a submitted file's bytes from storage after verifying the caller's
// application access. The stored (Cloudinary) URL is resolved and fetched
// server-side only — the client just gets the bytes, never the URL.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        await dbConnect();

        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const email = searchParams.get('email') || '';
        const accessToken = searchParams.get('accessToken') || '';
        const documentId = searchParams.get('documentId') || '';
        const field = searchParams.get('field') || '';

        if (!email || !accessToken) {
            return NextResponse.json({ error: 'Email and access token are required' }, { status: 400 });
        }

        const hasAccess = await verifyApplicationAccess(email, accessToken);
        if (!hasAccess) {
            return NextResponse.json({ error: 'Your session has expired. Request a new verification code.' }, { status: 401 });
        }

        const application = await JobApplication.findOne({
            _id: id,
            applicantEmail: { $regex: new RegExp(`^${email.trim()}$`, 'i') },
        });
        if (!application) {
            return NextResponse.json({ error: 'Application not found for the provided credentials' }, { status: 404 });
        }

        // Resolve the stored URL for the requested file, scoped to this
        // application so one applicant can never reach another's files.
        let sourceUrl = '';
        let fileName = 'document';
        if (documentId) {
            const doc = await ApplicationDocument.findOne({ _id: documentId, applicationId: application._id })
                .select('fileUrl fileName')
                .lean();
            sourceUrl = doc?.fileUrl || '';
            fileName = doc?.fileName || fileName;
        } else if (field) {
            const value = application.customFieldValues?.get?.(field);
            if (typeof value === 'string') sourceUrl = value;
        } else {
            return NextResponse.json({ error: 'A documentId or field is required' }, { status: 400 });
        }

        if (!/^https?:\/\//i.test(sourceUrl)) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        // Authenticated assets need a freshly signed URL; public (legacy) ones
        // stream as-is. Fall back to the stored URL if the signed fetch fails.
        let upstream = await fetch(signedFetchUrl(sourceUrl));
        if (!upstream.ok) {
            const fallback = await fetch(sourceUrl);
            if (fallback.ok) upstream = fallback;
        }
        if (!upstream.ok || !upstream.body) {
            return NextResponse.json({ error: 'Unable to retrieve file' }, { status: 502 });
        }

        const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
        const headers = new Headers({
            'Content-Type': contentType,
            // Render inline in the viewer; the filename is used if the user saves it.
            'Content-Disposition': `inline; filename="${fileName.replace(/"/g, '')}"`,
            'Cache-Control': 'private, no-store',
        });
        const contentLength = upstream.headers.get('content-length');
        if (contentLength) headers.set('Content-Length', contentLength);

        return new Response(upstream.body, { status: 200, headers });
    } catch (error: any) {
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
