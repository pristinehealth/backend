import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import Staff from '@/models/Staff';

export async function POST() {
    try {
        const perfexEndpoint = process.env.PERFEX_ENDPOINT;
        const adminToken = process.env.PERFEX_ADMIN_TOKEN;

        if (!perfexEndpoint || !adminToken) {
            return NextResponse.json(
                { error: 'Missing PERFEX_ENDPOINT or PERFEX_ADMIN_TOKEN environment variables.' },
                { status: 500 }
            );
        }

        // 1. Fetch latest staff data from Perfex
        const response = await fetch(`${perfexEndpoint}/staffs`, {
            method: 'GET',
            headers: {
                'authtoken': adminToken,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Perfex API Error:', errorText);
            return NextResponse.json(
                { error: `Failed to fetch staff from Perfex: ${response.status} ${response.statusText}` },
                { status: response.status }
            );
        }

        const perfexStaffData = await response.json();

        // Ensure data is an array
        const staffList = Array.isArray(perfexStaffData)
            ? perfexStaffData
            : (perfexStaffData && Array.isArray(perfexStaffData.data) ? perfexStaffData.data : []);

        if (staffList.length === 0) {
            return NextResponse.json({ message: 'No staff data found in Perfex to sync.' });
        }

        // 2. Connect to local database
        await dbConnect();

        // 3. Perform bulk upsert
        const bulkOps = staffList.map((staff: any) => ({
            updateOne: {
                filter: { staffid: staff.staffid },
                update: { $set: staff },
                upsert: true
            }
        }));

        const activeIds = staffList.map((staff: any) => staff.staffid);

        const result = await Staff.bulkWrite(bulkOps);
        const deleteResult = await Staff.deleteMany({ staffid: { $nin: activeIds } });

        return NextResponse.json({
            success: true,
            message: 'Staff data synchronized successfully',
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount,
            upsertedCount: result.upsertedCount,
            deletedCount: deleteResult.deletedCount
        });

    } catch (error: any) {
        console.error('Error syncing staff:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', details: error.message },
            { status: 500 }
        );
    }
}
