import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import Task from '@/models/Task';
import Timesheet from '@/models/Timesheet';
import Staff from '@/models/Staff';
import Customer from '@/models/Customer';
import Project from '@/models/Project';
import { buildChangedBulkOps } from '@/lib/syncDiff';

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
        const resourceMap: Record<string, { model: any, endpoint: string, idKey: string, omitFields?: string[] }> = {
            'tasks': { model: Task, endpoint: 'tasks', idKey: 'id' },
            'timesheets': { model: Timesheet, endpoint: 'timesheets', idKey: 'id' },
            // Drop Perfex's `password` (a credential hash) — never used, needless liability.
            'staff': { model: Staff, endpoint: 'staffs', idKey: 'staffid', omitFields: ['password'] },
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
            let unchanged = 0;
            const activeIds: any[] = [];
            const items: Array<{ idValue: any; payload: Record<string, any> }> = [];

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

                    for (const item of chunk) {
                        const idValue = item[config.idKey];
                        activeIds.push(idValue);

                        const updatePayload = { ...item };
                        // If Perfex sends an empty customfields array (or omits it), do NOT overwrite our local DB copy
                        if (resourceName === 'projects' && (!item.customfields || item.customfields.length === 0)) {
                            delete updatePayload.customfields;
                        }
                        // Drop sensitive fields (e.g. Perfex staff password hash) before storing.
                        for (const f of config.omitFields || []) delete updatePayload[f];

                        items.push({ idValue, payload: updatePayload });
                    }

                    if (chunk.length < length) {
                        hasMore = false;
                    } else {
                        start += length;
                    }
                }

                // Diff against stored docs — write only new/changed records so an
                // unchanged sync does zero writes (see syncDiff).
                if (items.length > 0) {
                    const existingDocs = await config.model
                        .find({ [config.idKey]: { $in: activeIds } })
                        .lean();
                    const existingMap = new Map<string, any>(
                        (existingDocs as any[]).map((d) => [String(d[config.idKey]), d])
                    );
                    const { ops, unchanged: skipped } = buildChangedBulkOps(items, existingMap, config.idKey);
                    unchanged = skipped;
                    if (ops.length > 0) {
                        await config.model.bulkWrite(ops);
                        totalSynced += ops.length;
                    }
                    if (skipped > 0) {
                        console.log(`[Scoped Sync] ${config.endpoint}: ${skipped}/${items.length} unchanged — skipped writes.`);
                    }
                }

                // Delete local orphans. Note: a failed page fetch above throws,
                // which jumps to the catch below BEFORE reaching this delete, so
                // orphan pruning is skipped on fetch errors. Keep this block
                // inside the try so that protection is preserved.
                let deletedCount = 0;
                if (activeIds.length > 0) {
                    const deleteResult = await config.model.deleteMany({ [config.idKey]: { $nin: activeIds } });
                    deletedCount = deleteResult.deletedCount;
                }

                syncResults[resourceName] = {
                    synced: true,
                    totalActive: activeIds.length,
                    written: totalSynced,
                    unchanged,
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
