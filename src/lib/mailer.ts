import nodemailer from 'nodemailer';

export type OtpPurpose = 'verification' | 'reset';

export async function sendOtpEmail(to: string, code: string, name: string, purpose: OtpPurpose = 'reset') {
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;

    const subject = purpose === 'verification'
        ? 'Verify Your Pristine Account'
        : 'Pristine Password Reset Code';

    const bodyHeading = purpose === 'verification'
        ? 'Email Verification'
        : 'Password Reset';

    const bodyIntro = purpose === 'verification'
        ? 'Please use the code below to verify your email address and activate your account.'
        : 'Use the code below to reset your password. If you did not request this, please ignore this email.';

    if (!user || !pass || !host) {
        console.log(`\n========================================`);
        console.log(`[DEV] OTP for ${to} (${purpose.toUpperCase()})`);
        console.log(`CODE: ${code}`);
        console.log(`========================================\n`);
        return;
    }

    const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
    });

    await transporter.sendMail({
        from: `"Pristine Staffing" <${user}>`,
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
}
