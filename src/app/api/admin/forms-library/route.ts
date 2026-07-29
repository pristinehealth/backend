import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import DownloadableForm from '@/models/DownloadableForm';

export const dynamic = 'force-dynamic';

async function isAdmin() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return false;
    const role = (session.user as any).role;
    return role === 'admin' || role === 'superadmin';
}

// List the whole library (active + inactive) for the admin manager.
export async function GET() {
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        await dbConnect();
        const forms = await DownloadableForm.find({}).sort({ order: 1, createdAt: 1 }).lean();
        return NextResponse.json({ data: forms });
    } catch (error: any) {
        console.error('GET /api/admin/forms-library error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}

// Add a form to the library. The file is uploaded separately via /api/upload
// (source 'admin' → returns a URL); the client passes back { fileUrl, fileName }.
export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!(await isAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        await dbConnect();
        const body = await request.json();
        const title = String(body?.title || '').trim();
        const fileUrl = String(body?.fileUrl || '').trim();

        if (!title) {
            return NextResponse.json({ error: 'A form title is required' }, { status: 400 });
        }
        if (!/^https?:\/\//i.test(fileUrl)) {
            return NextResponse.json({ error: 'A valid uploaded file is required' }, { status: 400 });
        }

        const last = await DownloadableForm.findOne({}).sort({ order: -1 }).select('order').lean();
        const nextOrder = ((last as any)?.order ?? -1) + 1;

        const form = await DownloadableForm.create({
            title,
            description: String(body?.description || '').trim(),
            category: String(body?.category || '').trim(),
            fileUrl,
            fileName: String(body?.fileName || '').trim(),
            active: body?.active !== false,
            order: nextOrder,
            uploadedByEmail: session?.user?.email || '',
        });

        return NextResponse.json({ message: 'Form added', data: form }, { status: 201 });
    } catch (error: any) {
        console.error('POST /api/admin/forms-library error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
