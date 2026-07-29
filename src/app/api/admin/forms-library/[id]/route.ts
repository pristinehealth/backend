import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import DownloadableForm from '@/models/DownloadableForm';
import { deleteAssetByUrl } from '@/lib/cloudinary';

export const dynamic = 'force-dynamic';

async function isAdmin() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return false;
    const role = (session.user as any).role;
    return role === 'admin' || role === 'superadmin';
}

// Update a library form: rename/describe/recategorize, toggle active, reorder, or
// replace the file (pass a new fileUrl — the old asset is freed).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        await dbConnect();
        const { id } = await params;
        const body = await request.json();

        const form = await DownloadableForm.findById(id);
        if (!form) {
            return NextResponse.json({ error: 'Form not found' }, { status: 404 });
        }

        if (typeof body.title === 'string' && body.title.trim()) form.title = body.title.trim();
        if (typeof body.description === 'string') form.description = body.description.trim();
        if (typeof body.category === 'string') form.category = body.category.trim();
        if (typeof body.active === 'boolean') form.active = body.active;
        if (typeof body.order === 'number' && Number.isFinite(body.order)) form.order = body.order;

        // Replacing the file: swap the URL and free the previous asset (best-effort).
        if (typeof body.fileUrl === 'string' && /^https?:\/\//i.test(body.fileUrl) && body.fileUrl !== form.fileUrl) {
            const oldUrl = form.fileUrl;
            form.fileUrl = body.fileUrl;
            if (typeof body.fileName === 'string') form.fileName = body.fileName.trim();
            if (oldUrl) {
                try { await deleteAssetByUrl(oldUrl); } catch { /* non-fatal */ }
            }
        } else if (typeof body.fileName === 'string') {
            form.fileName = body.fileName.trim();
        }

        await form.save();
        return NextResponse.json({ message: 'Form updated', data: form });
    } catch (error: any) {
        console.error('PATCH /api/admin/forms-library/[id] error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        await dbConnect();
        const { id } = await params;
        const form = await DownloadableForm.findByIdAndDelete(id);
        if (!form) {
            return NextResponse.json({ error: 'Form not found' }, { status: 404 });
        }
        if (form.fileUrl) {
            try { await deleteAssetByUrl(form.fileUrl); } catch { /* non-fatal */ }
        }
        return NextResponse.json({ message: 'Form deleted' });
    } catch (error: any) {
        console.error('DELETE /api/admin/forms-library/[id] error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
