import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import DownloadableForm from '@/models/DownloadableForm';
import { verifyApplicationAccess } from '@/lib/applicationAccess';
import { fetchStoredFile } from '@/lib/cloudinary';

export const dynamic = 'force-dynamic';

// Streams a downloadable library form to an authenticated applicant. The storage
// URL is fetched server-side (handling Cloudinary's PDF delivery restriction),
// so it never reaches the browser.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        await dbConnect();
        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const email = searchParams.get('email') || '';
        const accessToken = searchParams.get('accessToken') || '';

        if (!email || !accessToken) {
            return NextResponse.json({ error: 'Email and access token are required' }, { status: 400 });
        }
        if (!(await verifyApplicationAccess(email, accessToken))) {
            return NextResponse.json({ error: 'Your session has expired. Request a new link.' }, { status: 401 });
        }

        const form = await DownloadableForm.findOne({ _id: id, active: true }).select('fileUrl fileName title').lean();
        const sourceUrl = (form as any)?.fileUrl || '';
        if (!/^https?:\/\//i.test(sourceUrl)) {
            return NextResponse.json({ error: 'Form not found' }, { status: 404 });
        }

        const upstream = await fetchStoredFile(sourceUrl, 'onboarding/resource');
        if (!upstream || !upstream.body) {
            return NextResponse.json({ error: 'Unable to retrieve file' }, { status: 502 });
        }

        const fileName = ((form as any)?.fileName || (form as any)?.title || 'form').replace(/"/g, '');
        const headers = new Headers({
            'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
            // Prompt a download (these are blank forms to fill out offline).
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'Cache-Control': 'private, no-store',
        });
        const contentLength = upstream.headers.get('content-length');
        if (contentLength) headers.set('Content-Length', contentLength);

        return new Response(upstream.body, { status: 200, headers });
    } catch (error: any) {
        console.error('[onboarding/resource download] error:', error?.message || error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
