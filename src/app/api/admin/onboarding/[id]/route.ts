import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import OnboardingForm from '@/models/OnboardingForm';
import OnboardingResponse from '@/models/OnboardingResponse';
import JobPosition from '@/models/JobPosition';
import { resolveFileReference } from '@/lib/uploadResolve';

async function isAdmin() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return false;
    const role = (session.user as any).role;
    return role === 'admin' || role === 'superadmin';
}

// Validate submitted answers against the questionnaire's field definitions.
// Mirrors the per-type loop in src/app/api/jobs/[id]/apply/route.ts. `requireAll`
// is only enforced when marking complete — a mid-onboarding save may be partial.
async function validateAnswers(
    fields: any[],
    input: Record<string, any>,
    requireAll: boolean
): Promise<{ error?: string; values?: Record<string, any> }> {
    const values: Record<string, any> = {};
    for (const field of fields) {
        const val = input[field.name];
        const isEmpty = val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0);

        if (requireAll && field.required && isEmpty) {
            return { error: `"${field.label}" is required` };
        }
        if (isEmpty) continue;

        if (field.type === 'number') {
            const num = Number(val);
            if (Number.isNaN(num)) return { error: `"${field.label}" must be a number` };
            values[field.name] = num;
        } else if (field.type === 'checkbox') {
            if (!Array.isArray(val)) return { error: `"${field.label}" must be a list of selected options` };
            values[field.name] = val;
        } else if (field.type === 'file') {
            values[field.name] = await resolveFileReference(val);
        } else {
            values[field.name] = val;
        }
    }
    return { values };
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

        const form = await OnboardingForm.findById(response.onboardingFormId).select('customFields').lean();
        const fields = Array.isArray((form as any)?.customFields) ? (form as any).customFields : [];

        const nextStatus = body?.status === 'completed' ? 'completed' : body?.status === 'in_progress' ? 'in_progress' : undefined;
        const requireAll = nextStatus === 'completed';

        const answersInput = body?.answers && typeof body.answers === 'object' ? body.answers : {};
        const validation = await validateAnswers(fields, answersInput, requireAll);
        if (validation.error) {
            return NextResponse.json({ error: validation.error }, { status: 400 });
        }

        response.answers = new Map(Object.entries(validation.values || {}));
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
