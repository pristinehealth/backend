import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import JobApplication from '@/models/JobApplication';
import JobPosition from '@/models/JobPosition';
import OnboardingInvite from '@/models/OnboardingInvite';
import { verifyApplicationAccess } from '@/lib/applicationAccess';
import { resolveEmployeeRecordIdByEmail } from '@/lib/employeeRecord';
import {
    inviteValidity,
    buildOnboardingTrackPayload,
    applyOnboardingTrackPatch,
    type TrackSubject,
} from '@/lib/onboardingTrackCore';

export const dynamic = 'force-dynamic';

async function findApp(applicationId: string, email: string) {
    return JobApplication.findOne({
        _id: applicationId,
        applicantEmail: { $regex: new RegExp(`^${email.trim()}$`, 'i') },
    });
}

export async function GET(request: Request, { params }: { params: Promise<{ applicationId: string }> }) {
    try {
        await dbConnect();
        const { applicationId } = await params;
        const { searchParams } = new URL(request.url);
        const email = searchParams.get('email') || '';
        const accessToken = searchParams.get('accessToken') || '';

        if (!email || !accessToken) {
            return NextResponse.json({ error: 'Email and access token are required' }, { status: 400 });
        }
        if (!(await verifyApplicationAccess(email, accessToken))) {
            return NextResponse.json({ error: 'Your session has expired. Request a new link.' }, { status: 401 });
        }

        const application = await findApp(applicationId, email);
        if (!application) {
            return NextResponse.json({ error: 'Application not found for the provided credentials' }, { status: 404 });
        }

        const invite = await OnboardingInvite.findOne({ applicationId });
        const validity = inviteValidity(invite);
        if (!validity.valid || !invite) {
            return NextResponse.json({ valid: false, reason: validity.reason, applicantName: application.applicantName });
        }

        const cred = new URLSearchParams({ email, accessToken }).toString();
        const job = await JobPosition.findById(application.jobId).select('title').lean();
        const subject: TrackSubject = {
            fileBasePath: applicationId,
            ownerFilter: { applicationId: application._id },
            docOwner: { applicationId: application._id },
            applicantName: application.applicantName,
            applicantEmail: application.applicantEmail,
            jobTitle: (job as any)?.title || 'Position',
        };
        return NextResponse.json(await buildOnboardingTrackPayload(subject, invite, cred));
    } catch (error: any) {
        console.error('GET /api/onboarding/track/[applicationId] error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ applicationId: string }> }) {
    try {
        await dbConnect();
        const { applicationId } = await params;
        const body = await request.json();
        const email = String(body?.email || '');
        const accessToken = String(body?.accessToken || '');
        const submit = body?.submit === true;

        if (!email || !accessToken) {
            return NextResponse.json({ error: 'Email and access token are required' }, { status: 400 });
        }
        if (!(await verifyApplicationAccess(email, accessToken))) {
            return NextResponse.json({ error: 'Your session has expired. Request a new link.' }, { status: 401 });
        }

        const application = await findApp(applicationId, email);
        if (!application) {
            return NextResponse.json({ error: 'Application not found for the provided credentials' }, { status: 404 });
        }

        const invite = await OnboardingInvite.findOne({ applicationId });
        const validity = inviteValidity(invite);
        if (!validity.valid || !invite) {
            return NextResponse.json({ error: 'This onboarding link is no longer valid.' }, { status: 403 });
        }

        // Dual-write the person-centric owner onto any documents created (Phase 1).
        const employeeRecordId = await resolveEmployeeRecordIdByEmail(application.applicantEmail, {
            name: application.applicantName,
            applicationId: application._id,
        });
        const subject: TrackSubject = {
            fileBasePath: applicationId,
            ownerFilter: { applicationId: application._id },
            docOwner: { applicationId: application._id, employeeRecordId },
            applicantName: application.applicantName,
            applicantEmail: application.applicantEmail,
            jobTitle: '',
        };
        const { status, body: resBody } = await applyOnboardingTrackPatch(subject, invite, body, submit);
        return NextResponse.json(resBody, { status });
    } catch (error: any) {
        console.error('PATCH /api/onboarding/track/[applicationId] error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
