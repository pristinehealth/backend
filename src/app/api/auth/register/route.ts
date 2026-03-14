import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import dbConnect from '@/lib/mongoose';
import User from '@/models/User';
import Staff from '@/models/Staff';

export async function POST(req: Request) {
    try {
        const { name, email, password } = await req.json();

        if (!name || !email || !password) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const normalizedEmail = email.toLowerCase().trim();

        await dbConnect();

        // ── Perfex Staff Gate ──────────────────────────────────────────────────
        // Only allow registration if the email belongs to a Perfex staff member
        // with admin === "1". The Staff collection is synced from Perfex via cron.
        const staffRecord = await Staff.findOne({ email: normalizedEmail }).lean() as any;

        if (!staffRecord) {
            return NextResponse.json(
                { error: 'Your email is not registered as a Perfex staff member. Contact your administrator.' },
                { status: 403 }
            );
        }

        if (staffRecord.admin !== '1') {
            return NextResponse.json(
                { error: 'Access denied. Only Perfex administrators can register for this dashboard.' },
                { status: 403 }
            );
        }
        // ──────────────────────────────────────────────────────────────────────

        // Check if dashboard user already exists
        const existingUser = await User.findOne({ email: normalizedEmail });
        if (existingUser) {
            return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 400 });
        }

        // Hash password and create user
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await User.create({
            name: name || `${staffRecord.firstname} ${staffRecord.lastname}`.trim(),
            email: normalizedEmail,
            password: hashedPassword,
        });

        return NextResponse.json(
            { message: 'Admin account created successfully', userId: user._id },
            { status: 201 }
        );
    } catch (error: any) {
        console.error('Registration error:', error);
        return NextResponse.json(
            { error: 'An error occurred during registration', details: error.message },
            { status: 500 }
        );
    }
}
