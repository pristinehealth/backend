import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import Staff from '@/models/Staff';

// Returns a lightweight map of staffid → { emailVerified, hasPassword }
// Used by the admin dashboard to show mobile app registration status
export async function GET() {
    try {
        await dbConnect();

        const staff = await Staff.find(
            {},
            { staffid: 1, email: 1, emailVerified: 1, passwordHash: 1, _id: 0 }
        ).lean();

        const statusMap = Object.fromEntries(
            staff.map((s: any) => [
                String(s.staffid),
                {
                    emailVerified: !!s.emailVerified,
                    hasPassword: !!s.passwordHash,
                }
            ])
        );

        return NextResponse.json({ success: true, data: statusMap });

    } catch (error: any) {
        console.error('[Staff Auth Status] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
