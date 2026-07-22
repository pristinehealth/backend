import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import OnboardingForm from '@/models/OnboardingForm';
import OnboardingResponse from '@/models/OnboardingResponse';

async function isAdmin() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return false;
    const role = (session.user as any).role;
    return role === 'admin' || role === 'superadmin';
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let idStr = '';
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }
        await dbConnect();
        const { id } = await params;
        idStr = id;
        const form = await OnboardingForm.findById(id);
        if (!form) {
            return NextResponse.json({ success: false, error: 'Questionnaire not found' }, { status: 404 });
        }
        return NextResponse.json({ success: true, data: form });
    } catch (error: any) {
        console.error(`GET /api/admin/onboarding-forms/${idStr || 'unknown'} error:`, error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let idStr = '';
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }
        await dbConnect();
        const { id } = await params;
        idStr = id;
        const body = await request.json();

        const form = await OnboardingForm.findById(id);
        if (!form) {
            return NextResponse.json({ success: false, error: 'Questionnaire not found' }, { status: 404 });
        }

        if (body.name && body.name !== form.name) {
            const existing = await OnboardingForm.findOne({ name: body.name });
            if (existing) {
                return NextResponse.json({ success: false, error: 'Questionnaire name already exists' }, { status: 400 });
            }
            form.name = body.name;
        }

        if (body.customFields !== undefined) {
            form.customFields = body.customFields;
        }

        await form.save();
        return NextResponse.json({ success: true, data: form });
    } catch (error: any) {
        console.error(`PUT /api/admin/onboarding-forms/${idStr || 'unknown'} error:`, error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let idStr = '';
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }
        await dbConnect();
        const { id } = await params;
        idStr = id;

        // Referential guard: don't delete a questionnaire that has onboarding records.
        const isUsed = await OnboardingResponse.findOne({ onboardingFormId: id });
        if (isUsed) {
            return NextResponse.json({
                success: false,
                error: 'Cannot delete: this questionnaire has been used for one or more candidates.',
            }, { status: 400 });
        }

        const deleted = await OnboardingForm.findByIdAndDelete(id);
        if (!deleted) {
            return NextResponse.json({ success: false, error: 'Questionnaire not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, message: 'Questionnaire deleted successfully' });
    } catch (error: any) {
        console.error(`DELETE /api/admin/onboarding-forms/${idStr || 'unknown'} error:`, error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
