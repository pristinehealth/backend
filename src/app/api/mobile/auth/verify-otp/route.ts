import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import Staff from '@/models/Staff';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret-please-change-in-prod';

export async function POST(req: Request) {
    try {
        const { email, code } = await req.json();

        if (!email || !code) {
            return NextResponse.json({ error: 'Email and OTP code are required' }, { status: 400 });
        }

        await dbConnect();

        // 1. Find Staff by Email
        const staff = await Staff.findOne({ email });

        if (!staff) {
            return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 401 });
        }

        // 2. Validate OTP existence and expiration
        if (!staff.otpCode || !staff.otpExpiry || staff.otpExpiry < new Date()) {
            // Expired or none requested
            return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 401 });
        }

        // 3. Verify the Code matches
        if (staff.otpCode !== code) {
            return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 401 });
        }

        // 4. Issue standard JWT token containing relevant context
        const token = jwt.sign(
            {
                userid: staff.staffid,
                email: staff.email,
                role: staff.role,
                admin: staff.admin
            },
            JWT_SECRET,
            { expiresIn: '30d' } // e.g. Mobile session lasts 30 days
        );

        // 5. Burn the OTP so it can't be used twice
        staff.otpCode = undefined;
        staff.otpExpiry = undefined;
        await staff.save();

        // 6. Return successful payload
        return NextResponse.json({
            token,
            user: {
                id: staff.staffid,
                email: staff.email,
                firstname: staff.firstname,
                lastname: staff.lastname,
                role: staff.role,
                admin: staff.admin
            }
        });

    } catch (error: any) {
        console.error('OTP Validation Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
