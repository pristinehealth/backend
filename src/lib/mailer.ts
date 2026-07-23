import { Resend } from 'resend';

export type OtpPurpose = 'verification' | 'reset';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM || 'noreply@staff.pristinehealthstaffing.com';
// Where public contact-form submissions are delivered.
const CONTACT_INBOX = process.env.CONTACT_INBOX || 'info@pristinehealthstaffing.com';

/**
 * Deliver a public contact-form submission to the support inbox. `replyTo` is
 * set to the submitter so staff can reply directly. Falls back to a console log
 * in dev when no RESEND_API_KEY is configured.
 */
export async function sendContactEmail(input: {
    name: string;
    email: string;
    phone?: string;
    inquiryType?: string;
    message: string;
}) {
    const { name, email, phone, inquiryType, message } = input;
    const type = inquiryType || 'General';

    if (!process.env.RESEND_API_KEY) {
        console.log(`\n========== [DEV] Contact form submission ==========`);
        console.log(`From: ${name} <${email}>${phone ? ` · ${phone}` : ''}`);
        console.log(`Type: ${type}`);
        console.log(`Message:\n${message}`);
        console.log(`===================================================\n`);
        return;
    }

    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const { error } = await resend.emails.send({
        from: `Pristine Website <${FROM}>`,
        to: CONTACT_INBOX,
        replyTo: email,
        subject: `New ${type} inquiry from ${name}`,
        text: `New contact submission\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone || '—'}\nType: ${type}\n\nMessage:\n${message}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #F97316;">New ${esc(type)} Inquiry</h2>
                <table style="width: 100%; font-size: 14px; color: #111827; border-collapse: collapse;">
                    <tr><td style="padding: 6px 0; color: #6b7280; width: 90px;">Name</td><td style="padding: 6px 0; font-weight: bold;">${esc(name)}</td></tr>
                    <tr><td style="padding: 6px 0; color: #6b7280;">Email</td><td style="padding: 6px 0;"><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>
                    <tr><td style="padding: 6px 0; color: #6b7280;">Phone</td><td style="padding: 6px 0;">${esc(phone || '—')}</td></tr>
                    <tr><td style="padding: 6px 0; color: #6b7280;">Type</td><td style="padding: 6px 0;">${esc(type)}</td></tr>
                </table>
                <div style="margin-top: 16px; padding: 16px; background: #F3F4F6; border-radius: 8px; white-space: pre-wrap; color: #111827; font-size: 14px; line-height: 1.6;">${esc(message)}</div>
                <p style="color: #9ca3af; font-size: 12px; margin-top: 16px;">Reply directly to this email to respond to ${esc(name)}.</p>
            </div>
        `,
    });

    if (error) {
        console.error(`[Mailer] Resend error sending contact inquiry:`, error);
        throw new Error(`Failed to send email: ${error.message}`);
    }

    console.log(`[Mailer] Contact inquiry from ${email} delivered to ${CONTACT_INBOX}`);
}

/**
 * Notify the admin/recruiting inbox that a new job application was submitted.
 * Recipient: ADMIN_NOTIFICATION_EMAIL, falling back to the contact inbox
 * (info@pristinehealthstaffing.com).
 * Best-effort — callers should not let a mail failure block the submission.
 */
export async function sendNewApplicationAdminEmail(input: {
    applicantName: string;
    applicantEmail: string;
    jobTitle: string;
    applicationId: string;
}) {
    const { applicantName, applicantEmail, jobTitle, applicationId } = input;
    const to = process.env.ADMIN_NOTIFICATION_EMAIL || CONTACT_INBOX;

    if (!process.env.RESEND_API_KEY) {
        console.log(`\n========== [DEV] New application ==========`);
        console.log(`Applicant: ${applicantName} <${applicantEmail}>`);
        console.log(`Position: ${jobTitle}`);
        console.log(`Recipient: ${to}`);
        console.log(`===========================================\n`);
        return;
    }

    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const base = (process.env.PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || '').replace(/\/$/, '');
    const reviewUrl = base ? `${base}/dashboard?tab=jobs` : '';

    const { error } = await resend.emails.send({
        from: `Pristine Careers <${FROM}>`,
        to,
        replyTo: applicantEmail,
        subject: `New application: ${jobTitle} — ${applicantName}`,
        text: `A new job application was submitted.\n\nApplicant: ${applicantName}\nEmail: ${applicantEmail}\nPosition: ${jobTitle}\nApplication ID: ${applicationId}${reviewUrl ? `\n\nReview: ${reviewUrl}` : ''}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #3B6BB5;">New Job Application</h2>
                <table style="width: 100%; font-size: 14px; color: #111827; border-collapse: collapse;">
                    <tr><td style="padding: 6px 0; color: #6b7280; width: 90px;">Applicant</td><td style="padding: 6px 0; font-weight: bold;">${esc(applicantName)}</td></tr>
                    <tr><td style="padding: 6px 0; color: #6b7280;">Email</td><td style="padding: 6px 0;"><a href="mailto:${esc(applicantEmail)}">${esc(applicantEmail)}</a></td></tr>
                    <tr><td style="padding: 6px 0; color: #6b7280;">Position</td><td style="padding: 6px 0;">${esc(jobTitle)}</td></tr>
                </table>
                ${reviewUrl ? `<div style="margin: 22px 0;"><a href="${reviewUrl}" style="display: inline-block; background-color: #3B6BB5; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 22px; border-radius: 8px;">Review in dashboard</a></div>` : ''}
                <p style="color: #9ca3af; font-size: 12px; margin-top: 16px;">Reply to this email to contact the applicant directly.</p>
            </div>
        `,
    });

    if (error) {
        console.error(`[Mailer] Resend error sending new-application notice:`, error);
        throw new Error(`Failed to send email: ${error.message}`);
    }

    console.log(`[Mailer] New application notice for ${applicantEmail} delivered to ${to}`);
}

export async function sendOtpEmail(to: string, code: string, name: string, purpose: OtpPurpose = 'reset') {
    const apiKey = process.env.RESEND_API_KEY;

    // ── Dev fallback: no API key configured ──────────────────────────────────
    if (!apiKey) {
        console.log(`\n========================================`);
        console.log(`[DEV] OTP for ${to} (${purpose.toUpperCase()})`);
        console.log(`CODE: ${code}`);
        console.log(`========================================\n`);
        return;
    }

    const subject = purpose === 'verification'
        ? 'Verify Your Pristine Account'
        : 'Pristine Password Reset Code';

    const bodyHeading = purpose === 'verification'
        ? 'Email Verification'
        : 'Password Reset';

    const bodyIntro = purpose === 'verification'
        ? 'Please use the code below to verify your email address and activate your account.'
        : 'Use the code below to reset your password. If you did not request this, please ignore this email.';

    const { error } = await resend.emails.send({
        from: `Pristine Staffing <${FROM}>`,
        to,
        subject,
        text: `Hello ${name}, your ${purpose === 'verification' ? 'verification' : 'password reset'} code is: ${code}. It expires in 10 minutes.`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #3B6BB5;">Pristine ${bodyHeading}</h2>
                <p>Hello ${name},</p>
                <p>${bodyIntro}</p>
                <div style="background-color: #F3F4F6; padding: 15px; font-size: 28px; font-weight: bold; text-align: center; letter-spacing: 8px; border-radius: 8px; margin: 24px 0; color: #111827;">
                    ${code}
                </div>
                <p style="color: #666; font-size: 12px;">This code will expire in 10 minutes.</p>
            </div>
        `,
    });

    if (error) {
        console.error(`[Mailer] Resend error sending to ${to}:`, error);
        throw new Error(`Failed to send email: ${error.message}`);
    }

    console.log(`[Mailer] OTP email sent to ${to} (${purpose})`);
}

export async function sendApplicationAccessCodeEmail(to: string, code: string, name: string, jobTitle: string) {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
        console.log(`\n========================================`);
        console.log(`[DEV] Job Application Access Code for ${to}`);
        console.log(`JOB: ${jobTitle}`);
        console.log(`CODE: ${code}`);
        console.log(`========================================\n`);
        return;
    }

    const { error } = await resend.emails.send({
        from: `Pristine Staffing <${FROM}>`,
        to,
        subject: `Your Application for ${jobTitle} - Access Code`,
        text: `Hello ${name},\n\nThank you for applying for the position of ${jobTitle}. You can track your application status using the access code: ${code}.\n\nBest regards,\nPristine Staffing Team`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #3B6BB5;">Pristine Application Received</h2>
                <p>Hello ${name},</p>
                <p>Thank you for applying for the position of <strong>${jobTitle}</strong>.</p>
                <p>You can check and track your application status on our system using the access code below alongside your email:</p>
                <div style="background-color: #F3F4F6; padding: 15px; font-size: 28px; font-weight: bold; text-align: center; letter-spacing: 8px; border-radius: 8px; margin: 24px 0; color: #111827;">
                    ${code}
                </div>
                <p style="color: #666; font-size: 12px;">Please save this code to check your status later.</p>
            </div>
        `,
    });

    if (error) {
        console.error(`[Mailer] Resend error sending application code to ${to}:`, error);
        throw new Error(`Failed to send email: ${error.message}`);
    }

    console.log(`[Mailer] Application access code email sent to ${to}`);
}

export async function sendApplicationTrackingOtpEmail(to: string, code: string) {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
        console.log(`\n========================================`);
        console.log(`[DEV] Tracking OTP for ${to}`);
        console.log(`CODE: ${code}`);
        console.log(`========================================\n`);
        return;
    }

    const { error } = await resend.emails.send({
        from: `Pristine Staffing <${FROM}>`,
        to,
        subject: 'Your Pristine Application Access Code',
        text: `Use this one-time code to access your application: ${code}. The code expires in 10 minutes.`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #3B6BB5;">Application Access Verification</h2>
                <p>Use the one-time code below to access your applications.</p>
                <div style="background-color: #F3F4F6; padding: 15px; font-size: 28px; font-weight: bold; text-align: center; letter-spacing: 8px; border-radius: 8px; margin: 24px 0; color: #111827;">
                    ${code}
                </div>
                <p style="color: #666; font-size: 12px;">This code expires in 10 minutes and can only be used to start a new access session.</p>
            </div>
        `,
    });

    if (error) {
        console.error(`[Mailer] Resend error sending tracking OTP to ${to}:`, error);
        throw new Error(`Failed to send email: ${error.message}`);
    }

    console.log(`[Mailer] Tracking OTP email sent to ${to}`);
}

type ApplicationStatus = 'pending' | 'reviewed' | 'shortlisted' | 'rejected' | 'accepted' | 'changes_requested';

const statusLabelMap: Record<ApplicationStatus, string> = {
    pending: 'Pending',
    reviewed: 'Reviewed',
    shortlisted: 'Shortlisted',
    rejected: 'Rejected',
    accepted: 'Accepted',
    changes_requested: 'Changes Requested',
};

export async function sendApplicationStatusChangeEmail(
    to: string,
    name: string,
    jobTitle: string,
    status: ApplicationStatus,
    trackingUrl?: string
) {
    const apiKey = process.env.RESEND_API_KEY;
    const statusLabel = statusLabelMap[status] || status;

    if (!apiKey) {
        console.log(`\n========================================`);
        console.log(`[DEV] Application Status Update for ${to}`);
        console.log(`JOB: ${jobTitle}`);
        console.log(`STATUS: ${statusLabel}`);
        if (trackingUrl) console.log(`ACCESS LINK: ${trackingUrl}`);
        console.log(`========================================\n`);
        return;
    }

    // One-click access link (valid 7 days) so applicants can open their
    // application straight from the email without requesting a new code.
    const ctaHtml = trackingUrl
        ? `<div style="margin: 22px 0;">
                <a href="${trackingUrl}" style="display: inline-block; background-color: #3B6BB5; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 22px; border-radius: 8px;">View your application</a>
            </div>
            <p style="color: #666; font-size: 12px;">This secure link is unique to you and expires in 7 days. If it expires, you can still track your application anytime from the candidate portal using your email and a one-time code.</p>`
        : `<p style="color: #666; font-size: 12px;">You can continue tracking your application from the candidate portal using your email and access code.</p>`;

    const ctaText = trackingUrl
        ? `\n\nView your application (secure link, expires in 7 days):\n${trackingUrl}`
        : '';

    const { error } = await resend.emails.send({
        from: `Pristine Staffing <${FROM}>`,
        to,
        subject: `Application Update: ${jobTitle} (${statusLabel})`,
        text: `Hello ${name},\n\nYour application for ${jobTitle} has been updated to: ${statusLabel}.${ctaText}\n\nBest regards,\nPristine Staffing Team`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #3B6BB5;">Pristine Application Update</h2>
                <p>Hello ${name},</p>
                <p>Your application for <strong>${jobTitle}</strong> has been updated.</p>
                <div style="background-color: #F3F4F6; padding: 14px; border-radius: 8px; margin: 18px 0;">
                    <p style="margin: 0; color: #4B5563; font-size: 12px;">Current Status</p>
                    <p style="margin: 6px 0 0 0; color: #111827; font-weight: 700; font-size: 20px;">${statusLabel}</p>
                </div>
                ${ctaHtml}
            </div>
        `,
    });

    if (error) {
        console.error(`[Mailer] Resend error sending status email to ${to}:`, error);
        throw new Error(`Failed to send email: ${error.message}`);
    }

    console.log(`[Mailer] Application status email sent to ${to}`);
}

export async function sendApplicationNoteNotificationEmail(
    recipients: string[],
    payload: {
        applicantName: string;
        applicantEmail: string;
        jobTitle: string;
        noteAuthor: string;
        noteText: string;
    }
) {
    const apiKey = process.env.RESEND_API_KEY;
    const toList = recipients.filter(Boolean);
    if (!toList.length) return;

    const notePreview = payload.noteText.length > 280
        ? `${payload.noteText.slice(0, 280)}...`
        : payload.noteText;

    if (!apiKey) {
        console.log(`\n========================================`);
        console.log(`[DEV] Application Note Notification`);
        console.log(`RECIPIENTS: ${toList.join(', ')}`);
        console.log(`CANDIDATE: ${payload.applicantName} <${payload.applicantEmail}>`);
        console.log(`JOB: ${payload.jobTitle}`);
        console.log(`AUTHOR: ${payload.noteAuthor}`);
        console.log(`========================================\n`);
        return;
    }

    const { error } = await resend.emails.send({
        from: `Pristine Staffing <${FROM}>`,
        to: toList,
        subject: `Internal Note Added: ${payload.applicantName} (${payload.jobTitle})`,
        text: `An internal note was added by ${payload.noteAuthor}.\n\nCandidate: ${payload.applicantName} <${payload.applicantEmail}>\nJob: ${payload.jobTitle}\n\nNote:\n${notePreview}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #3B6BB5;">Internal Application Note</h2>
                <p><strong>Author:</strong> ${payload.noteAuthor}</p>
                <p><strong>Candidate:</strong> ${payload.applicantName} (${payload.applicantEmail})</p>
                <p><strong>Job:</strong> ${payload.jobTitle}</p>
                <div style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 12px; margin-top: 12px; white-space: pre-wrap; color: #111827;">
                    ${notePreview}
                </div>
            </div>
        `,
    });

    if (error) {
        console.error(`[Mailer] Resend error sending note notification:`, error);
        throw new Error(`Failed to send email: ${error.message}`);
    }

    console.log(`[Mailer] Application note notification sent to ${toList.join(', ')}`);
}

export async function sendDocumentExpiryReminder(
    to: string,
    staffName: string,
    documentLabel: string,
    expiryDate: Date,
    daysUntilExpiry: number
) {
    const apiKey = process.env.RESEND_API_KEY;
    const isExpired = daysUntilExpiry <= 0;
    const expiryDateStr = expiryDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });

    if (!apiKey) {
        console.log(`\n========================================`);
        console.log(`[DEV] Document Expiry Reminder`);
        console.log(`TO: ${to}`);
        console.log(`STAFF: ${staffName}`);
        console.log(`DOCUMENT: ${documentLabel}`);
        console.log(`EXPIRY: ${expiryDateStr} (${daysUntilExpiry} days)`);
        console.log(`STATUS: ${isExpired ? 'EXPIRED' : 'EXPIRING'}`);
        console.log(`========================================\n`);
        return;
    }

    let subject: string;
    let urgencyColor: string;
    let urgencyText: string;

    if (isExpired) {
        subject = `URGENT: ${documentLabel} Has Expired`;
        urgencyColor = '#dc2626';
        urgencyText = 'This document has expired and requires immediate renewal.';
    } else if (daysUntilExpiry <= 7) {
        subject = `URGENT: ${documentLabel} Expires in ${daysUntilExpiry} Day${daysUntilExpiry === 1 ? '' : 's'}`;
        urgencyColor = '#ea580c';
        urgencyText = `This document expires on ${expiryDateStr}. Please renew it as soon as possible.`;
    } else {
        subject = `Reminder: ${documentLabel} Expires in ${daysUntilExpiry} Days`;
        urgencyColor = '#f59e0b';
        urgencyText = `Please plan to renew this document before ${expiryDateStr}.`;
    }

    const { error } = await resend.emails.send({
        from: `Pristine Staffing <${FROM}>`,
        to,
        subject,
        text: `Hello ${staffName}, your ${documentLabel.toLowerCase()} document expires on ${expiryDateStr}. ${urgencyText}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <div style="background-color: ${urgencyColor}; color: white; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
                    <h2 style="margin: 0; font-size: 20px;">Document Expiry Notice</h2>
                </div>
                <p>Hello ${staffName},</p>
                <p style="color: #dc2626; font-weight: bold; font-size: 16px;">${urgencyText}</p>
                <div style="background-color: #F3F4F6; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid ${urgencyColor};">
                    <p style="margin: 0 0 8px 0; color: #666; font-size: 12px;">Document Type</p>
                    <p style="margin: 0 0 12px 0; font-weight: bold; color: #111827;">${documentLabel}</p>
                    <p style="margin: 0 0 8px 0; color: #666; font-size: 12px;">Expiry Date</p>
                    <p style="margin: 0; font-weight: bold; color: #111827; font-size: 16px;">${expiryDateStr}</p>
                </div>
                <p style="color: #666; font-size: 12px;">Please contact your administrator if you have any questions about document renewal requirements.</p>
            </div>
        `,
    });

    if (error) {
        console.error(`[Mailer] Resend error sending document expiry reminder to ${to}:`, error);
        throw new Error(`Failed to send email: ${error.message}`);
    }

    console.log(`[Mailer] Document expiry reminder sent to ${to} for ${documentLabel}`);
}

export async function sendStaffDocumentUploadNotification(
    to: string,
    staffName: string,
    documentLabel: string
) {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
        console.log(`\n========================================`);
        console.log(`[DEV] Staff Document Upload Notification`);
        console.log(`TO: ${to}`);
        console.log(`STAFF: ${staffName}`);
        console.log(`DOCUMENT: ${documentLabel}`);
        console.log(`========================================\n`);
        return;
    }

    const { error } = await resend.emails.send({
        from: `Pristine Staffing <${FROM}>`,
        to,
        subject: `New Document Uploaded: ${documentLabel}`,
        text: `${staffName} has uploaded a new document: ${documentLabel}. Please review it in the staff management portal.`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #3B6BB5;">Document Upload Notification</h2>
                <p><strong>Staff Member:</strong> ${staffName}</p>
                <p><strong>Document Type:</strong> ${documentLabel}</p>
                <div style="background-color: #F3F4F6; padding: 14px; border-radius: 8px; margin: 18px 0;">
                    <p style="margin: 0; color: #666; font-size: 12px;">Please log in to the staff management portal to review and verify this document.</p>
                </div>
            </div>
        `,
    });

    if (error) {
        console.error(`[Mailer] Resend error sending document upload notification to ${to}:`, error);
        throw new Error(`Failed to send email: ${error.message}`);
    }

    console.log(`[Mailer] Document upload notification sent to ${to}`);
}

