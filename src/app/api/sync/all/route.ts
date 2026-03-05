import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import Staff from '@/models/Staff';
import Customer from '@/models/Customer';
import Project from '@/models/Project';
import Task from '@/models/Task';
import Timesheet from '@/models/Timesheet';

async function fetchFromPerfex(endpoint: string, adminToken: string) {
    const response = await fetch(`${endpoint}`, {
        method: 'GET',
        headers: {
            'authtoken': adminToken,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch ${endpoint}: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
}

export async function POST(request: Request) {
    try {
        const url = new URL(request.url);
        const forceSync = url.searchParams.get('force') === 'true';

        const perfexEndpoint = process.env.PERFEX_ENDPOINT;
        const adminToken = process.env.PERFEX_ADMIN_TOKEN;

        if (!perfexEndpoint || !adminToken) {
            return NextResponse.json(
                { error: 'Missing PERFEX_ENDPOINT or PERFEX_ADMIN_TOKEN environment variables.' },
                { status: 500 }
            );
        }

        await dbConnect();

        const syncResults: any = {};

        // 1. Sync Staff
        try {
            const perfexStaff = await fetchFromPerfex(`${perfexEndpoint}/staffs`, adminToken);

            const bulkOps = perfexStaff.map((item: any) => ({
                updateOne: { filter: { staffid: item.staffid }, update: { $set: item }, upsert: true }
            }));

            // Identify active IDs from Perfex to delete local orphans
            const activeIds = perfexStaff.map((item: any) => item.staffid);

            if (bulkOps.length > 0) {
                const result = await Staff.bulkWrite(bulkOps);
                const deleteResult = await Staff.deleteMany({ staffid: { $nin: activeIds } });

                syncResults.staff = {
                    synced: true,
                    matched: result.matchedCount,
                    upserted: result.upsertedCount,
                    modified: result.modifiedCount,
                    deleted: deleteResult.deletedCount
                };
            } else {
                syncResults.staff = { synced: false, message: 'No data from Perfex' };
            }
        } catch (e: any) {
            syncResults.staff = { error: e.message };
        }

        // 2. Sync Customers
        try {
            const perfexCustomers = await fetchFromPerfex(`${perfexEndpoint}/customers`, adminToken);

            const bulkOps = perfexCustomers.map((item: any) => ({
                updateOne: { filter: { userid: item.userid }, update: { $set: item }, upsert: true }
            }));

            // Identify active IDs from Perfex to delete local orphans
            const activeIds = perfexCustomers.map((item: any) => item.userid);

            if (bulkOps.length > 0) {
                const result = await Customer.bulkWrite(bulkOps);
                const deleteResult = await Customer.deleteMany({ userid: { $nin: activeIds } });

                syncResults.customers = {
                    synced: true,
                    matched: result.matchedCount,
                    upserted: result.upsertedCount,
                    modified: result.modifiedCount,
                    deleted: deleteResult.deletedCount
                };
            } else {
                syncResults.customers = { synced: false, message: 'No data from Perfex' };
            }
        } catch (e: any) {
            syncResults.customers = { error: e.message };
        }

        // 3. Sync Projects
        try {
            const perfexProjects = await fetchFromPerfex(`${perfexEndpoint}/projects`, adminToken);

            const bulkOps = perfexProjects.map((item: any) => {
                const updatePayload = { ...item };
                if (!item.customfields || item.customfields.length === 0) {
                    delete updatePayload.customfields;
                }
                return {
                    updateOne: { filter: { id: item.id }, update: { $set: updatePayload }, upsert: true }
                };
            });

            // Identify active IDs from Perfex to delete local orphans
            const activeIds = perfexProjects.map((item: any) => item.id);

            if (bulkOps.length > 0) {
                const result = await Project.bulkWrite(bulkOps);
                const deleteResult = await Project.deleteMany({ id: { $nin: activeIds } });

                syncResults.projects = {
                    synced: true,
                    matched: result.matchedCount,
                    upserted: result.upsertedCount,
                    modified: result.modifiedCount,
                    deleted: deleteResult.deletedCount
                };
            } else {
                syncResults.projects = { synced: false, message: 'No data from Perfex' };
            }
        } catch (e: any) {
            syncResults.projects = { error: e.message };
        }

        // 4. Sync Tasks
        try {
            const perfexTasks = await fetchFromPerfex(`${perfexEndpoint}/tasks`, adminToken);

            const bulkOps = perfexTasks.map((item: any) => ({
                updateOne: { filter: { id: item.id }, update: { $set: item }, upsert: true }
            }));

            // Identify active IDs from Perfex to delete local orphans
            const activeIds = perfexTasks.map((item: any) => item.id);

            if (bulkOps.length > 0) {
                const result = await Task.bulkWrite(bulkOps);
                const deleteResult = await Task.deleteMany({ id: { $nin: activeIds } });

                syncResults.tasks = {
                    synced: true,
                    matched: result.matchedCount,
                    upserted: result.upsertedCount,
                    modified: result.modifiedCount,
                    deleted: deleteResult.deletedCount
                };
            } else {
                syncResults.tasks = { synced: false, message: 'No data from Perfex' };
            }
        } catch (e: any) {
            syncResults.tasks = { error: e.message };
        }

        // 5. Sync Timesheets
        try {
            const perfexTimesheets = await fetchFromPerfex(`${perfexEndpoint}/timesheets`, adminToken);

            const bulkOps = perfexTimesheets.map((item: any) => ({
                updateOne: { filter: { id: item.id }, update: { $set: item }, upsert: true }
            }));

            // Identify active IDs from Perfex to delete local orphans
            const activeIds = perfexTimesheets.map((item: any) => item.id);

            if (bulkOps.length > 0) {
                const result = await Timesheet.bulkWrite(bulkOps);
                const deleteResult = await Timesheet.deleteMany({ id: { $nin: activeIds } });

                syncResults.timesheets = {
                    synced: true,
                    matched: result.matchedCount,
                    upserted: result.upsertedCount,
                    modified: result.modifiedCount,
                    deleted: deleteResult.deletedCount
                };
            } else {
                syncResults.timesheets = { synced: false, message: 'No data from Perfex' };
            }
        } catch (e: any) {
            syncResults.timesheets = { error: e.message };
        }

        return NextResponse.json({
            success: true,
            message: 'Synchronization process completed.',
            results: syncResults
        });

    } catch (error: any) {
        console.error('Error during global sync:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', details: error.message },
            { status: 500 }
        );
    }
}
