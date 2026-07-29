import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import DownloadableForm from '@/models/DownloadableForm';
import { verifyApplicationAccess } from '@/lib/applicationAccess';

export const dynamic = 'force-dynamic';

// The active downloadable-forms library, for an authenticated applicant. Returns
// only display fields + a same-origin download ref (never the storage URL). Used
// by both the onboarding page and the /jobs/track page — any valid applicant
// access token (magic-link or OTP session) can list them.
export async function GET(request: Request) {
    try {
        await dbConnect();
        const { searchParams } = new URL(request.url);
        const email = searchParams.get('email') || '';
        const accessToken = searchParams.get('accessToken') || '';

        if (!email || !accessToken) {
            return NextResponse.json({ error: 'Email and access token are required' }, { status: 400 });
        }
        if (!(await verifyApplicationAccess(email, accessToken))) {
            return NextResponse.json({ error: 'Your session has expired. Request a new link.' }, { status: 401 });
        }

        const cred = new URLSearchParams({ email, accessToken }).toString();
        const forms = await DownloadableForm.find({ active: true })
            .sort({ order: 1, createdAt: 1 })
            .select('title description category fileName')
            .lean();

        const resources = forms.map((f: any) => ({
            _id: String(f._id),
            title: f.title,
            description: f.description || '',
            category: f.category || '',
            fileName: f.fileName || '',
            downloadRef: `/api/onboarding/resources/${String(f._id)}/download?${cred}`,
        }));

        return NextResponse.json({ resources });
    } catch (error: any) {
        console.error('GET /api/onboarding/resources error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
