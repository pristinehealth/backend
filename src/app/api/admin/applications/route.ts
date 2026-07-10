import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import JobApplication from '@/models/JobApplication';
import JobPosition from '@/models/JobPosition';
import ApplicationForm from '@/models/ApplicationForm';

export const dynamic = 'force-dynamic';

async function isAdmin() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return false;
    const role = (session.user as any).role;
    return role === 'admin' || role === 'superadmin';
}

export async function GET(request: Request) {
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const { searchParams } = new URL(request.url);
        const jobId = searchParams.get('jobId');
        const status = searchParams.get('status');

        const filter: any = {};
        if (jobId) filter.jobId = jobId;
        if (status) filter.status = status;

        const applications = await JobApplication.find(filter).sort({ createdAt: -1 }).lean();

        const enrichedApplications = await Promise.all(applications.map(async (app: any) => {
            const job = await JobPosition.findById(app.jobId).select('title formId').lean();
            let customFields: any[] = [];
            if (job?.formId) {
                const form = await ApplicationForm.findById(job.formId).select('customFields').lean();
                if (form) {
                    customFields = form.customFields;
                }
            }
            return {
                ...app,
                jobTitle: job?.title || 'Unknown Position',
                customFields
            };
        }));

        return NextResponse.json(enrichedApplications);
    } catch (error: any) {
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
