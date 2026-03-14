import { Resend } from 'resend';

export type OtpPurpose = 'verification' | 'reset';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM || 'noreply@staff.pristinehealthstaffing.com';

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
