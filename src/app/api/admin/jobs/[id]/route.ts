import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import JobPosition from '@/models/JobPosition';
import { markImageConsumed, discardPositionImage } from '@/lib/positionImage';

export const dynamic = 'force-dynamic';

async function isAdmin() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return false;
    const role = (session.user as any).role;
    return role === 'admin' || role === 'superadmin';
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    let idStr = "";
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const { id } = await params;
        idStr = id;
        const body = await request.json();

        // Load the current image so we can free the old Cloudinary asset if the
        // image is being replaced or removed in this update.
        const existing = await JobPosition.findById(id).select('imageUrl imagePublicId').lean();
        if (!existing) {
            return NextResponse.json({ error: 'Job position not found' }, { status: 404 });
        }

        const imageFieldSent = Object.prototype.hasOwnProperty.call(body, 'imageUrl');
        const oldUrl = (existing as any).imageUrl as string | null;
        const oldPublicId = (existing as any).imagePublicId as string | null;
        const newPublicId = imageFieldSent ? (body.imagePublicId || null) : oldPublicId;
        const imageChanged = imageFieldSent && (body.imageUrl || null) !== (oldUrl || null);

        if (imageFieldSent && !body.imageUrl) body.imagePublicId = null; // removed → clear id too

        const updatedJob = await JobPosition.findByIdAndUpdate(
            id,
            { $set: body },
            { new: true, runValidators: true }
        );

        if (!updatedJob) {
            return NextResponse.json({ error: 'Job position not found' }, { status: 404 });
        }

        // Asset bookkeeping after a successful save.
        if (imageChanged) {
            if (oldUrl && oldPublicId !== newPublicId) {
                await discardPositionImage(oldUrl, oldPublicId); // old image replaced/removed
            }
            if (updatedJob.imageUrl) {
                await markImageConsumed(updatedJob.imagePublicId); // protect the new one
            }
        }

        return NextResponse.json({ message: 'Job position updated successfully', job: updatedJob });
    } catch (error: any) {
        console.error(`PATCH /api/admin/jobs/${idStr} error:`, error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    let idStr = "";
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const { id } = await params;
        idStr = id;

        const deletedJob = await JobPosition.findByIdAndDelete(id);
        if (!deletedJob) {
            return NextResponse.json({ error: 'Job position not found' }, { status: 404 });
        }

        // Free the position's image asset from Cloudinary.
        if (deletedJob.imageUrl) {
            await discardPositionImage(deletedJob.imageUrl, deletedJob.imagePublicId);
        }

        return NextResponse.json({ message: 'Job position deleted successfully' });
    } catch (error: any) {
        console.error(`DELETE /api/admin/jobs/${idStr} error:`, error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
