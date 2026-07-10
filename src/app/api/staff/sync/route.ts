import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import Staff from '@/models/Staff';
import { reconcileEmailKeyedCompliance, archiveTerminatedStaff } from '@/lib/documentHelpers';
import { buildChangedBulkOps } from '@/lib/syncDiff';

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

        const activeIds = staffList.map((staff: any) => staff.staffid).filter(Boolean);

        // 3. Diff against stored docs — write only new/changed staff so an
        // unchanged sync does zero writes (see syncDiff).
        const existingDocs = await Staff.find({ staffid: { $in: activeIds } }).lean();
        const existingMap = new Map<string, any>(
            (existingDocs as any[]).map((d) => [String(d.staffid), d])
        );
        const items = staffList.map((staff: any) => {
            const payload = { ...staff };
            delete payload.password; // never store Perfex's staff credential hash
            return { idValue: staff.staffid, payload };
        });
        const { ops, unchanged } = buildChangedBulkOps(items, existingMap, 'staffid');

        const result = ops.length
            ? await Staff.bulkWrite(ops)
            : { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
        if (unchanged > 0) {
            console.log(`[Staff Sync] ${unchanged}/${items.length} unchanged — skipped writes.`);
        }

        // Orphan prune: only delete staff missing from the fetched set when we
        // actually received a non-empty, valid list. The earlier `!response.ok`
        // and empty-list early returns already bail out before here, so reaching
        // this point means the fetch succeeded; the `activeIds.length > 0` guard
        // is a final safeguard against wiping the collection on a bad response.
        let deletedCount = 0;
        if (activeIds.length > 0) {
            // Archive terminated staff's compliance data (retention clock) BEFORE
            // removing their Staff row — never silently orphan it.
            const removed = await Staff.find({ staffid: { $nin: activeIds } }).select('staffid').lean();
            await archiveTerminatedStaff(removed.map((s: any) => String(s.staffid)));

            const deleteResult = await Staff.deleteMany({ staffid: { $nin: activeIds } });
            deletedCount = deleteResult.deletedCount;
        }

        // Heal any accept-before-sync data now that staff rows exist.
        const reconcile = await reconcileEmailKeyedCompliance();

        return NextResponse.json({
            success: true,
            message: 'Staff data synchronized successfully',
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount,
            upsertedCount: result.upsertedCount,
            unchanged,
            deletedCount,
            reconcile
        });

    } catch (error: any) {
        console.error('Error syncing staff:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', details: error.message },
            { status: 500 }
        );
    }
}
