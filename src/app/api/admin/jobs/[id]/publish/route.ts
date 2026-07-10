import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import JobPosition from '@/models/JobPosition';
import ApplicationForm from '@/models/ApplicationForm';

async function isAdmin() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return false;
    const role = (session.user as any).role;
    return role === 'admin' || role === 'superadmin';
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const { id } = await params;
        const body = await request.json().catch(() => ({}));

        const job = await JobPosition.findById(id);
        if (!job) {
            return NextResponse.json({ success: false, error: 'Job position not found' }, { status: 404 });
        }

        // If the user specified a formId in the request body, attach it first
        if (body.formId) {
            const formExists = await ApplicationForm.findById(body.formId);
            if (!formExists) {
                return NextResponse.json({ success: false, error: 'Invalid form ID provided' }, { status: 400 });
            }
            job.formId = body.formId;
        }

        // Verify if a form is attached
        if (!job.formId) {
            return NextResponse.json({
                success: false,
                error: 'NO_FORM_ATTACHED',
                message: 'An application form must be attached before publishing.'
            }, { status: 400 });
        }

        const formExists = await ApplicationForm.findById(job.formId);
        if (!formExists) {
            return NextResponse.json({
                success: false,
                error: 'NO_FORM_ATTACHED',
                message: 'The attached application form no longer exists. Please link a new one.'
            }, { status: 400 });
        }

        job.status = 'open';
        await job.save();

        return NextResponse.json({ success: true, data: job });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
