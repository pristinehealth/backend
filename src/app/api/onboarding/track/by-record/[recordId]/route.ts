import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import EmployeeRecord from '@/models/EmployeeRecord';
import OnboardingInvite from '@/models/OnboardingInvite';
import { verifyApplicationAccess } from '@/lib/applicationAccess';
import { normalizeEmail } from '@/lib/employeeRecord';
import {
    inviteValidity,
    buildOnboardingTrackPayload,
    applyOnboardingTrackPatch,
    type TrackSubject,
} from '@/lib/onboardingTrackCore';

export const dynamic = 'force-dynamic';

// Load the EmployeeRecord for this onboarding session and confirm the signed,
// email-scoped access token belongs to the SAME person (record.email === email),
// so a valid token for one email can't open another person's record.
async function findRecord(recordId: string, email: string) {
    const rec = await EmployeeRecord.findById(recordId);
    if (!rec || !rec.email || normalizeEmail(rec.email) !== normalizeEmail(email)) return null;
    return rec;
}

function subjectFor(recordId: string, rec: any): TrackSubject {
    return {
        fileBasePath: `by-record/${recordId}`,
        ownerFilter: { employeeRecordId: rec._id },
        docOwner: { employeeRecordId: rec._id },
        applicantName: rec.name || '',
        applicantEmail: rec.email,
        jobTitle: 'Onboarding',
    };
}

export async function GET(request: Request, { params }: { params: Promise<{ recordId: string }> }) {
    try {
        await dbConnect();
        const { recordId } = await params;
        const { searchParams } = new URL(request.url);
        const email = searchParams.get('email') || '';
        const accessToken = searchParams.get('accessToken') || '';

        if (!email || !accessToken) {
            return NextResponse.json({ error: 'Email and access token are required' }, { status: 400 });
        }
        if (!(await verifyApplicationAccess(email, accessToken))) {
            return NextResponse.json({ error: 'Your session has expired. Request a new link.' }, { status: 401 });
        }

        const rec = await findRecord(recordId, email);
        if (!rec) {
            return NextResponse.json({ error: 'Onboarding record not found for the provided credentials' }, { status: 404 });
        }

        const invite = await OnboardingInvite.findOne({ employeeRecordId: rec._id });
        const validity = inviteValidity(invite);
        if (!validity.valid || !invite) {
            return NextResponse.json({ valid: false, reason: validity.reason, applicantName: rec.name || '' });
        }

        const cred = new URLSearchParams({ email, accessToken }).toString();
        return NextResponse.json(await buildOnboardingTrackPayload(subjectFor(recordId, rec), invite, cred));
    } catch (error: any) {
        console.error('GET /api/onboarding/track/by-record/[recordId] error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ recordId: string }> }) {
    try {
        await dbConnect();
        const { recordId } = await params;
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

        const rec = await findRecord(recordId, email);
        if (!rec) {
            return NextResponse.json({ error: 'Onboarding record not found for the provided credentials' }, { status: 404 });
        }

        const invite = await OnboardingInvite.findOne({ employeeRecordId: rec._id });
        const validity = inviteValidity(invite);
        if (!validity.valid || !invite) {
            return NextResponse.json({ error: 'This onboarding link is no longer valid.' }, { status: 403 });
        }

        const { status, body: resBody } = await applyOnboardingTrackPatch(subjectFor(recordId, rec), invite, body, submit);
        return NextResponse.json(resBody, { status });
    } catch (error: any) {
        console.error('PATCH /api/onboarding/track/by-record/[recordId] error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
