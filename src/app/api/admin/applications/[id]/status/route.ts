import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import JobApplication from '@/models/JobApplication';
import JobPosition from '@/models/JobPosition';
import Staff from '@/models/Staff';
import Settings from '@/models/Settings';
import { sendApplicationStatusChangeEmail } from '@/lib/mailer';
import { linkApplicationDocumentsToStaff } from '@/lib/documentHelpers';
import { createApplicationAccessLinkToken } from '@/lib/applicationAccess';

export const dynamic = 'force-dynamic';

// Deep link straight to this application, pre-authenticated with a signed
// access token so the applicant lands on it without requesting a new code.
function buildTrackingUrl(applicationId: string, email: string): string | undefined {
    const token = createApplicationAccessLinkToken(email);
    if (!token) return undefined;
    const base = (process.env.PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '');
    return `${base}/jobs/track/${applicationId}?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
}

async function isAdmin() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return false;
    const role = (session.user as any).role;
    return role === 'admin' || role === 'superadmin';
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        console.log('[Admin Application Status] PATCH start');
        if (!(await isAdmin())) {
            console.warn('[Admin Application Status] Unauthorized request');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const { id } = await params;
        const body = await request.json();
        const status = typeof body?.status === 'string' ? body.status : '';
        const note = typeof body?.note === 'string' ? body.note.trim() : '';
        console.log('[Admin Application Status] Input received', { id, status, hasNote: !!note });

        const allowedStatuses = ['pending', 'reviewed', 'shortlisted', 'rejected', 'accepted', 'changes_requested'];
        if (!status || !allowedStatuses.includes(status)) {
            console.warn('[Admin Application Status] Invalid status payload', { id, status });
            return NextResponse.json({ error: `Invalid status. Must be one of: ${allowedStatuses.join(', ')}` }, { status: 400 });
        }

        // Requesting changes or rejecting must carry a reason — it becomes the
        // note the applicant sees and the reason in their email.
        if ((status === 'changes_requested' || status === 'rejected') && !note) {
            return NextResponse.json({ error: 'A reason is required when requesting changes or rejecting.' }, { status: 400 });
        }

        // Author for the note comes from the reviewer's session.
        const session = await getServerSession(authOptions);
        const reviewerName = (session?.user as any)?.name || session?.user?.email || 'Reviewer';

        const update: any = { $set: { status } };
        if (note) {
            update.$push = { notes: { author: reviewerName, text: note, createdAt: new Date() } };
        }

        const application = await JobApplication.findByIdAndUpdate(
            id,
            update,
            { returnDocument: 'after', runValidators: true }
        );

        console.log('[Admin Application Status] DB update result', {
            id,
            found: !!application,
            updatedStatus: application?.status,
        });


        if (!application) {
            console.warn('[Admin Application Status] Application not found', { id });
            return NextResponse.json({ error: 'Application not found' }, { status: 404 });
        }

        try {
            const [setting, job] = await Promise.all([
                Settings.findOne({ key: 'app_notify_status_change' }).lean(),
                JobPosition.findById(application.jobId).select('title').lean()
            ]);
            
            const shouldNotify = setting?.value !== 'false';
            if (shouldNotify) {
                await sendApplicationStatusChangeEmail(
                    application.applicantEmail,
                    application.applicantName,
                    job?.title || 'Job Position',
                    status,
                    buildTrackingUrl(String(application._id), application.applicantEmail),
                    note
                );
                console.log('[Admin Application Status] Notification sent', {
                    id,
                    recipient: application.applicantEmail,
                    status,
                });
            }
        } catch (mailErr: any) {
            console.error('[Application Status] Failed to send notification email:', mailErr?.message || mailErr);
        }

        // On acceptance, copy the applicant's verified documents into their staff
        // record and stamp the hired position. Best-effort and idempotent — never
        // block the status update.
        if (status === 'accepted') {
            try {
                const staff = await Staff.findOne({
                    email: { $regex: new RegExp(`^${application.applicantEmail.trim()}$`, 'i') },
                }).select('staffid').lean();

                // Stamp the definitive staff↔application link + hired position.
                // If the staff doesn't exist yet (accept-before-sync), we leave
                // acceptedStaffId null; the sync reconcile completes it once the
                // Perfex staff row appears (matched by email, one time).
                if (staff?.staffid) {
                    const job = await JobPosition.findById(application.jobId).select('title').lean();
                    await Promise.all([
                        JobApplication.updateOne(
                            { _id: application._id },
                            { $set: { acceptedStaffId: String(staff.staffid) } }
                        ),
                        Staff.updateOne(
                            { staffid: staff.staffid },
                            { $set: { positionId: String(application.jobId), positionTitle: job?.title || null } }
                        ),
                    ]);
                    console.log('[Admin Application Status] Linked application to staff', {
                        id,
                        staffid: staff.staffid,
                    });
                } else {
                    console.log('[Admin Application Status] Staff not yet synced — link deferred to reconcile', {
                        id,
                        email: application.applicantEmail,
                    });
                }

                const linkResult = await linkApplicationDocumentsToStaff(
                    String(application._id),
                    application.applicantEmail,
                    staff?.staffid
                );

                console.log('[Admin Application Status] Document link result', { id, ...linkResult });

                if (linkResult.linkedCount > 0) {
                    await JobApplication.findByIdAndUpdate(application._id, {
                        $push: {
                            notes: {
                                author: 'System',
                                text: `Linked ${linkResult.linkedCount} verified document(s) to staff record ${
                                    staff?.staffid ? staff.staffid : '(keyed by email — staff not yet synced)'
                                }.`,
                                createdAt: new Date(),
                            },
                        },
                    });
                }
            } catch (linkErr: any) {
                console.error('[Application Status] Failed to link documents to staff:', linkErr?.message || linkErr);
            }
        }

        console.log('[Admin Application Status] PATCH success', { id, status });
        return NextResponse.json({ message: 'Application status updated successfully', application });
    } catch (error: any) {
        console.error('[Admin Application Status] PATCH failed', {
            message: error?.message,
            name: error?.name,
            code: error?.code,
            kind: error?.kind,
            value: error?.value,
            errors: error?.errors,
            stack: error?.stack,
        });
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
