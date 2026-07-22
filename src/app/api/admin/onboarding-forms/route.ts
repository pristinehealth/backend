import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import OnboardingForm from '@/models/OnboardingForm';

export const dynamic = 'force-dynamic';

async function isAdmin() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return false;
    const role = (session.user as any).role;
    return role === 'admin' || role === 'superadmin';
}

export async function GET() {
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const forms = await OnboardingForm.find({}).sort({ createdAt: -1 }).lean();
        return NextResponse.json({ data: forms });
    } catch (error: any) {
        console.error('GET /api/admin/onboarding-forms error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const body = await request.json();
        const { name, customFields } = body;

        if (!name) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 });
        }
        if (!customFields || !Array.isArray(customFields)) {
            return NextResponse.json({ error: 'customFields array is required' }, { status: 400 });
        }

        const newForm = await OnboardingForm.create({ name, customFields });
        return NextResponse.json({ message: 'Onboarding questionnaire created successfully', data: newForm }, { status: 201 });
    } catch (error: any) {
        console.error('POST /api/admin/onboarding-forms error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
