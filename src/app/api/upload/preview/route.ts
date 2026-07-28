import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import UploadAsset from '@/models/UploadAsset';
import { fetchStoredFile } from '@/lib/cloudinary';

export const dynamic = 'force-dynamic';

// Streams a not-yet-submitted upload back to the applicant who uploaded it, so
// the apply form can preview a file without exposing the storage (Cloudinary)
// URL. Scoped to the (publicId, clientSessionId) pair the uploader owns — both
// are needed, and clientSessionId is an unguessable per-session id, so this is
// not an open proxy.
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const publicId = searchParams.get('publicId') || '';
        const clientSessionId = searchParams.get('clientSessionId') || '';

        if (!publicId || !clientSessionId) {
            return NextResponse.json({ error: 'publicId and clientSessionId are required' }, { status: 400 });
        }

        await dbConnect();

        const asset = await UploadAsset.findOne({
            publicId,
            clientSessionId,
            status: { $ne: 'deleted' },
        }).select('url originalFileName').lean();

        const sourceUrl = asset?.url || '';
        if (!/^https?:\/\//i.test(sourceUrl)) {
            console.warn('[upload/preview] no stored url for asset', {
                publicId,
                assetFound: !!asset,
                sourceUrlEmpty: !sourceUrl,
            });
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        // Resolve + fetch with full logging (see fetchStoredFile). Authenticated
        // PDFs go via the download API; images/raw via a signed delivery URL.
        const upstream = await fetchStoredFile(sourceUrl, 'upload/preview');
        if (!upstream || !upstream.body) {
            return NextResponse.json({ error: 'Unable to retrieve file' }, { status: 502 });
        }

        const fileName = (asset?.originalFileName || 'document').replace(/"/g, '');
        const headers = new Headers({
            'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
            'Content-Disposition': `inline; filename="${fileName}"`,
            'Cache-Control': 'private, no-store',
        });
        const contentLength = upstream.headers.get('content-length');
        if (contentLength) headers.set('Content-Length', contentLength);

        return new Response(upstream.body, { status: 200, headers });
    } catch (error: any) {
        console.error('[upload/preview] unhandled error:', error?.message || error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
