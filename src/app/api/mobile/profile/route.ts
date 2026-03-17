import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import Staff from '@/models/Staff';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret-please-change-in-prod';

export async function GET(req: Request) {
    try {
        const authHeader = req.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized: Missing or invalid token' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        let decodedToken: any;
        try {
            decodedToken = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            return NextResponse.json({ error: 'Unauthorized: Token is invalid or expired' }, { status: 401 });
        }

        const staffid = decodedToken.userid;
        if (!staffid) {
            return NextResponse.json({ error: 'Unauthorized: Token payload missing userid' }, { status: 401 });
        }

        await dbConnect();

        const staff = await Staff.findOne({ staffid }).lean();

        if (!staff || !staff.isBackendRegistered) {
            return NextResponse.json({ error: 'Staff member not found or account not registered' }, { status: 404 });
        }

        // Exclude sensitive fields before returning
        const { otpCode, otpExpiry, ...safeStaffData } = staff;

        return NextResponse.json({
            success: true,
            data: safeStaffData
        });

    } catch (error: any) {
        console.error('Error fetching mobile profile:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const authHeader = req.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized: Missing or invalid token' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        let decodedToken: any;
        try {
            decodedToken = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            return NextResponse.json({ error: 'Unauthorized: Token is invalid or expired' }, { status: 401 });
        }

        const staffid = decodedToken.userid;
        if (!staffid) {
            return NextResponse.json({ error: 'Unauthorized: Token payload missing userid' }, { status: 401 });
        }

        await dbConnect();

        const staff = await Staff.findOneAndUpdate(
            { staffid },
            { 
                $set: { 
                    isBackendRegistered: false,
                    passwordHash: null,
                    emailVerified: false,
                    otpCode: null,
                    otpExpiry: null
                } 
            },
            { new: true }
        );

        if (!staff) {
            return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            message: 'Account deleted successfully'
        });

    } catch (error: any) {
        console.error('Error deleting mobile profile:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
