import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import EmployeeRecord from '@/models/EmployeeRecord';
import ApplicationDocument from '@/models/ApplicationDocument';
import OnboardingResponse from '@/models/OnboardingResponse';
import { verifyApplicationAccess } from '@/lib/applicationAccess';
import { normalizeEmail } from '@/lib/employeeRecord';
import { fetchStoredFile } from '@/lib/cloudinary';

export const dynamic = 'force-dynamic';

// Record-based twin of the applicant onboarding file route (Phase 3). Streams a
// submitted onboarding file scoped to the caller's EmployeeRecord + email:
//  - ?documentId=          → a compliance ApplicationDocument
//  - ?responseId=&field=   → a file ANSWER inside an OnboardingResponse
export async function GET(request: Request, { params }: { params: Promise<{ recordId: string }> }) {
    try {
        await dbConnect();

        const { recordId } = await params;
        const { searchParams } = new URL(request.url);
        const email = searchParams.get('email') || '';
        const accessToken = searchParams.get('accessToken') || '';
        const documentId = searchParams.get('documentId') || '';
        const responseId = searchParams.get('responseId') || '';
        const field = searchParams.get('field') || '';

        if (!email || !accessToken) {
            return NextResponse.json({ error: 'Email and access token are required' }, { status: 400 });
        }
        if (!(await verifyApplicationAccess(email, accessToken))) {
            return NextResponse.json({ error: 'Your session has expired. Request a new link.' }, { status: 401 });
        }

        const rec = await EmployeeRecord.findById(recordId).select('_id email');
        if (!rec || !rec.email || normalizeEmail(rec.email) !== normalizeEmail(email)) {
            return NextResponse.json({ error: 'Onboarding record not found for the provided credentials' }, { status: 404 });
        }

        let sourceUrl = '';
        let fileName = 'document';
        if (documentId) {
            const doc = await ApplicationDocument.findOne({ _id: documentId, employeeRecordId: rec._id })
                .select('fileUrl fileName')
                .lean();
            sourceUrl = (doc as any)?.fileUrl || '';
            fileName = (doc as any)?.fileName || fileName;
        } else if (responseId && field) {
            const response = await OnboardingResponse.findOne({ _id: responseId, employeeRecordId: rec._id })
                .select('answers')
                .lean();
            const value = (response as any)?.answers?.[field];
            if (typeof value === 'string') sourceUrl = value;
        } else {
            return NextResponse.json({ error: 'A documentId or responseId+field is required' }, { status: 400 });
        }

        if (!/^https?:\/\//i.test(sourceUrl)) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        const upstream = await fetchStoredFile(sourceUrl, 'onboarding/file');
        if (!upstream || !upstream.body) {
            return NextResponse.json({ error: 'Unable to retrieve file' }, { status: 502 });
        }

        const headers = new Headers({
            'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
            'Content-Disposition': `inline; filename="${fileName.replace(/"/g, '')}"`,
            'Cache-Control': 'private, no-store',
        });
        const contentLength = upstream.headers.get('content-length');
        if (contentLength) headers.set('Content-Length', contentLength);

        return new Response(upstream.body, { status: 200, headers });
    } catch (error: any) {
        console.error('[onboarding/by-record/file] error:', error?.message || error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
