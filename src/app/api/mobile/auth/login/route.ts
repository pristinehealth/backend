import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dbConnect from '@/lib/mongoose';
import Staff from '@/models/Staff';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret-please-change-in-prod';

export async function POST(req: Request) {
    try {
        const { email, password } = await req.json();

        if (!email || !password) {
            return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
        }

        await dbConnect();

        // Case-insensitive email lookup to handle however Perfex stored it
        const staff = await Staff.findOne({
            email: { $regex: new RegExp(`^${email.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        });

        console.log(`[Login] email="${email.trim()}" → found: ${!!staff}, storedEmail: ${staff?.email}`);
        console.log(`[Login] hasPasswordHash: ${!!staff?.passwordHash}, emailVerified: ${staff?.emailVerified}`);

        const invalidErr = NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });

        if (!staff || !staff.passwordHash) {
            console.log(`[Login] ✗ no staff or no passwordHash`);
            return invalidErr;
        }

        if (!staff.emailVerified) {
            console.log(`[Login] ✗ emailVerified=false`);
            return NextResponse.json(
                { error: 'EMAIL_NOT_VERIFIED', message: 'Please verify your email address before logging in.' },
                { status: 403 }
            );
        }

        const passwordMatch = await bcrypt.compare(password, staff.passwordHash);
        console.log(`[Login] bcrypt.compare → ${passwordMatch}`);

        if (!passwordMatch) {
            console.log(`[Login] ✗ password mismatch`);
            return invalidErr;
        }

        const token = jwt.sign(
            { userid: staff.staffid, email: staff.email, role: staff.role, admin: staff.admin },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        console.log(`[Login] ✅ success for ${staff.email}`);

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
        console.error('[Login] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
