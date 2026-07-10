import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import JobApplication from '@/models/JobApplication';
import JobPosition from '@/models/JobPosition';
import { verifyApplicationAccess } from '@/lib/applicationAccess';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        await dbConnect();

        const body = await request.json();
        const { email, accessToken } = body;

        if (!email || !accessToken) {
            return NextResponse.json({ error: 'Email and access token are required' }, { status: 400 });
        }

        const hasAccess = await verifyApplicationAccess(email, accessToken);
        if (!hasAccess) {
            return NextResponse.json({ error: 'Your session has expired. Request a new verification code.' }, { status: 401 });
        }

        // Find applications by email after verifying access token
        const applications = await JobApplication.find({
            applicantEmail: { $regex: new RegExp(`^${email.trim()}$`, 'i') },
        }).lean();

        if (applications.length === 0) {
            return NextResponse.json({ error: 'No applications found for this email' }, { status: 404 });
        }

        // Hydrate applications with job details
        const enrichedApplications = await Promise.all(applications.map(async (app: any) => {
            const job = await JobPosition.findById(app.jobId).select('title description status').lean();
            return {
                ...app,
                jobTitle: job?.title || 'Unknown Position',
                jobStatus: job?.status || 'closed'
            };
        }));

        return NextResponse.json(enrichedApplications);
    } catch (error: any) {
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
