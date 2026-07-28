import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { fetchStoredFile } from '@/lib/cloudinary';

export const dynamic = 'force-dynamic';

async function isAdmin() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return false;
    const role = (session.user as any).role;
    return role === 'admin' || role === 'superadmin';
}

// Streams a stored file for authenticated admins, signing the URL when the asset
// is private ('authenticated'). Works for both public and private assets, so all
// admin document links can route through here uniformly. Restricted to Cloudinary
// hosts so it can't be used to fetch arbitrary URLs (SSRF).
export async function GET(request: Request) {
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const src = searchParams.get('src') || '';

        let host = '';
        try {
            host = new URL(src).hostname;
        } catch {
            return NextResponse.json({ error: 'Invalid file URL' }, { status: 400 });
        }
        if (!host.includes('cloudinary')) {
            return NextResponse.json({ error: 'Unsupported file host' }, { status: 400 });
        }

        const upstream = await fetchStoredFile(src, 'admin/file');
        if (!upstream || !upstream.body) {
            return NextResponse.json({ error: 'Unable to retrieve file' }, { status: 502 });
        }

        const headers = new Headers({
            'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
            'Content-Disposition': 'inline',
            'Cache-Control': 'private, no-store',
        });
        const contentLength = upstream.headers.get('content-length');
        if (contentLength) headers.set('Content-Length', contentLength);

        return new Response(upstream.body, { status: 200, headers });
    } catch (error: any) {
        console.error('[admin/file] unhandled error:', error?.message || error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
