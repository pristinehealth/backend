import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import OnboardingForm from '@/models/OnboardingForm';
import OnboardingResponse from '@/models/OnboardingResponse';
import JobPosition from '@/models/JobPosition';
import { validateAnswers } from '@/lib/onboardingAnswers';

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
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        await dbConnect();
        const { id } = await params;
        idStr = id;

        const response = await OnboardingResponse.findById(id).lean();
        if (!response) {
            return NextResponse.json({ error: 'Onboarding record not found' }, { status: 404 });
        }

        const [form, job] = await Promise.all([
            OnboardingForm.findById((response as any).onboardingFormId).select('name customFields').lean(),
            (response as any).jobId ? JobPosition.findById((response as any).jobId).select('title').lean() : null,
        ]);

        return NextResponse.json({
            response: {
                ...response,
                jobTitle: (job as any)?.title || 'Unknown Position',
            },
            form: {
                name: (form as any)?.name || 'Onboarding Questionnaire',
                customFields: Array.isArray((form as any)?.customFields) ? (form as any).customFields : [],
            },
        });
    } catch (error: any) {
        console.error(`GET /api/admin/onboarding/${idStr || 'unknown'} error:`, error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let idStr = '';
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        await dbConnect();
        const { id } = await params;
        idStr = id;
        const body = await request.json();

        const response = await OnboardingResponse.findById(id);
        if (!response) {
            return NextResponse.json({ error: 'Onboarding record not found' }, { status: 404 });
        }

        const form = await OnboardingForm.findById(response.onboardingFormId).select('name customFields').lean();
        const fields = Array.isArray((form as any)?.customFields) ? (form as any).customFields : [];

        // `status` is optional: omitting it saves answers without changing state.
        // Sending 'in_progress' on a completed record reopens it for correction.
        const nextStatus = body?.status === 'completed' ? 'completed' : body?.status === 'in_progress' ? 'in_progress' : undefined;
        // Required fields are enforced whenever the record ENDS UP completed —
        // including a plain save on an already-completed record, which would
        // otherwise let a completed questionnaire be emptied out.
        const requireAll = (nextStatus || response.status) === 'completed';

        const answersInput = body?.answers && typeof body.answers === 'object' ? body.answers : {};
        const validation = await validateAnswers(fields, answersInput, requireAll);
        if (validation.error) {
            return NextResponse.json({ error: validation.error }, { status: 400 });
        }

        const values = validation.values || {};
        response.answers = new Map(Object.entries(values));

        // Refresh the denormalized packet counters here, where the questionnaire's
        // fields are already loaded — the candidate list reads these instead of
        // every answers Map. `answeredCount` counts questions that still exist on
        // the questionnaire, so deleting a question can't leave 12/9 answered.
        const fieldNames = new Set(fields.map((f: any) => f?.name));
        response.answeredCount = Object.keys(values).filter((k) => fieldNames.has(k)).length;
        response.totalCount = fields.length;
        response.requiredCount = fields.filter((f: any) => f?.required).length;
        if ((form as any)?.name) response.formName = (form as any).name;

        if (nextStatus) {
            response.status = nextStatus;
            response.completedAt = nextStatus === 'completed' ? new Date() : null;
        }
        await response.save();

        return NextResponse.json({ message: 'Onboarding saved', data: response });
    } catch (error: any) {
        console.error(`PATCH /api/admin/onboarding/${idStr || 'unknown'} error:`, error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let idStr = '';
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        await dbConnect();
        const { id } = await params;
        idStr = id;

        const deleted = await OnboardingResponse.findByIdAndDelete(id);
        if (!deleted) {
            return NextResponse.json({ error: 'Onboarding record not found' }, { status: 404 });
        }
        return NextResponse.json({ message: 'Onboarding cancelled' });
    } catch (error: any) {
        console.error(`DELETE /api/admin/onboarding/${idStr || 'unknown'} error:`, error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
