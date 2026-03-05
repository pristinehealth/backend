import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import Task from '@/models/Task';
import Timesheet from '@/models/Timesheet';
import Staff from '@/models/Staff';
import Customer from '@/models/Customer';
import Project from '@/models/Project';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const resourcesToSync: string[] = body.resources || [];

        if (!Array.isArray(resourcesToSync) || resourcesToSync.length === 0) {
            return NextResponse.json({ error: 'Must provide an array of resources to sync.' }, { status: 400 });
        }

        const perfexEndpoint = process.env.PERFEX_ENDPOINT;
        const adminToken = process.env.PERFEX_ADMIN_TOKEN;

        if (!perfexEndpoint || !adminToken) {
            return NextResponse.json({ error: 'Missing CRM environment variables.' }, { status: 500 });
        }

        await dbConnect();
        const syncResults: Record<string, any> = {};

        // Helper mapper to route string names to correct Mongoose Models and API endpoints
        const resourceMap: Record<string, { model: any, endpoint: string, idKey: string }> = {
            'tasks': { model: Task, endpoint: 'tasks', idKey: 'id' },
            'timesheets': { model: Timesheet, endpoint: 'timesheets', idKey: 'id' },
            'staff': { model: Staff, endpoint: 'staffs', idKey: 'staffid' },
            'customers': { model: Customer, endpoint: 'customers', idKey: 'userid' },
            'projects': { model: Project, endpoint: 'projects', idKey: 'id' }
        };

        for (const resourceName of resourcesToSync) {
            const config = resourceMap[resourceName];
            if (!config) {
                syncResults[resourceName] = { error: 'Unknown resource type.' };
                continue;
            }

            console.log(`[Scoped Sync] Processing -> ${resourceName}`);
            let start = 0;
            const length = 50;
            let hasMore = true;
            let totalSynced = 0;
            const activeIds: any[] = [];

            try {
                while (hasMore) {
                    const paginatedUrl = `${perfexEndpoint}/${config.endpoint}?start=${start}&length=${length}`;
                    console.log(`[Scoped Sync] Fetching Page: ${config.endpoint} (start=${start}, length=${length})`);

                    const response = await fetch(paginatedUrl, {
                        method: 'GET',
                        headers: {
                            'authtoken': adminToken,
                            'Accept': 'application/json',
                            'Content-Type': 'application/json',
                        },
                    });

                    if (!response.ok) {
                        throw new Error(`Failed to fetch ${config.endpoint}: ${response.statusText}`);
                    }

                    const rawData = await response.json();
                    const chunk = Array.isArray(rawData) ? rawData : (rawData && Array.isArray(rawData.data) ? rawData.data : []);

                    if (chunk.length === 0) {
                        hasMore = false;
                        break;
                    }

                    const bulkOps = chunk.map((item: any) => {
                        const idValue = item[config.idKey];
                        activeIds.push(idValue);

                        const updatePayload = { ...item };
                        // If Perfex sends an empty customfields array (or omits it), do NOT overwrite our local DB copy
                        if (resourceName === 'projects' && (!item.customfields || item.customfields.length === 0)) {
                            delete updatePayload.customfields;
                        }

                        return {
                            updateOne: {
                                filter: { [config.idKey]: idValue },
                                update: { $set: updatePayload },
                                upsert: true
                            }
                        };
                    });

                    if (bulkOps.length > 0) {
                        await config.model.bulkWrite(bulkOps);
                        totalSynced += bulkOps.length;
                    }

                    if (chunk.length < length) {
                        hasMore = false;
                    } else {
                        start += length;
                    }
                }

                // Delete local orphans
                let deletedCount = 0;
                if (activeIds.length > 0) {
                    const deleteResult = await config.model.deleteMany({ [config.idKey]: { $nin: activeIds } });
                    deletedCount = deleteResult.deletedCount;
                }

                syncResults[resourceName] = {
                    synced: true,
                    totalActive: activeIds.length,
                    deleted: deletedCount
                };

            } catch (err: any) {
                syncResults[resourceName] = { error: err.message };
                console.error(`[Scoped Sync] Error processing ${resourceName}:`, err);
            }
        }

        return NextResponse.json({
            success: true,
            results: syncResults
        });

    } catch (error: any) {
        console.error('[Scoped Sync] Fatal Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
