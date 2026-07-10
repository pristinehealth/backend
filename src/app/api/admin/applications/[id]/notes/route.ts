import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import JobApplication from '@/models/JobApplication';
import JobPosition from '@/models/JobPosition';
import User from '@/models/User';
import Settings from '@/models/Settings';
import { sendApplicationNoteNotificationEmail } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

async function getAdminSession() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return null;
    const role = (session.user as any).role;
    if (role === 'admin' || role === 'superadmin') {
        return session;
    }
    return null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getAdminSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const { id } = await params;
        const body = await request.json();
        const { text } = body;

        if (!text || text.trim() === '') {
            return NextResponse.json({ error: 'Note text is required' }, { status: 400 });
        }

        const authorName = session.user?.name || session.user?.email || 'Admin';


        const updatedApplication = await JobApplication.findByIdAndUpdate(
            id,

            {
                $push: {
                    notes: {
                        author: authorName,
                        text: text.trim(),
                        createdAt: new Date()
                    }
                }
            },
            { new: true }
        );

        if (!updatedApplication) {
            return NextResponse.json({ error: 'Application not found' }, { status: 404 });
        }

        try {
            const [setting, job, admins] = await Promise.all([
                Settings.findOne({ key: 'app_notify_reviewer_notes' }).lean(),
                JobPosition.findById(updatedApplication.jobId).select('title').lean(),
                User.find({ role: { $in: ['admin', 'superadmin'] } }).select('email').lean()
            ]);

            const shouldNotify = setting?.value !== 'false';
            if (shouldNotify) {
                const actorEmail = String(session.user?.email || '').toLowerCase();
                const recipients = (admins as any[])
                    .map((admin: any) => String(admin.email || '').trim())
                    .filter((email) => email && email.toLowerCase() !== actorEmail);

                await sendApplicationNoteNotificationEmail(recipients, {
                    applicantName: updatedApplication.applicantName,
                    applicantEmail: updatedApplication.applicantEmail,
                    jobTitle: job?.title || 'Job Position',
                    noteAuthor: authorName,
                    noteText: text.trim(),
                });
            }
        } catch (mailErr: any) {
            console.error('[Application Notes] Failed to send internal note notification:', mailErr?.message || mailErr);
        }

        return NextResponse.json({
            message: 'Note added successfully',
            notes: updatedApplication.notes
        });
    } catch (error: any) {
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
