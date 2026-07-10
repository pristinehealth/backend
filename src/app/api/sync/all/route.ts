import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import Staff from '@/models/Staff';
import Customer from '@/models/Customer';
import Project from '@/models/Project';
import Task from '@/models/Task';
import Timesheet from '@/models/Timesheet';
import { reconcileEmailKeyedCompliance, archiveTerminatedStaff } from '@/lib/documentHelpers';
import { refreshStaffComplianceStatus } from '@/lib/compliance';
import { buildChangedBulkOps } from '@/lib/syncDiff';

const PAGE_SIZE = 50;

interface ResourceConfig {
    model: any;
    endpoint: string;
    idKey: string;
    /** If true, skip overwriting customfields when Perfex returns an empty array */
    preserveCustomfields?: boolean;
    /** Sensitive fields to drop from the Perfex payload before storing */
    omitFields?: string[];
}

const RESOURCE_MAP: Record<string, ResourceConfig> = {
    // Drop Perfex's `password` (a credential hash) — the app never uses it and
    // storing it is a needless liability.
    staffs: { model: Staff, endpoint: 'staffs', idKey: 'staffid', omitFields: ['password'] },
    customers: { model: Customer, endpoint: 'customers', idKey: 'userid' },
    projects: { model: Project, endpoint: 'projects', idKey: 'id', preserveCustomfields: true },
    tasks: { model: Task, endpoint: 'tasks', idKey: 'id' },
    timesheets: { model: Timesheet, endpoint: 'timesheets', idKey: 'id' },
};

/**
 * Paginated sync of a single resource from Perfex → MongoDB.
 * - Fetches all pages (start/length loop) before touching the DB.
 * - Orphan deleteMany only runs if ALL pages were fetched successfully.
 * - Returns a result summary for logging.
 */
async function syncResource(
    config: ResourceConfig,
    perfexEndpoint: string,
    adminToken: string
): Promise<Record<string, any>> {
    let start = 0;
    let hasMore = true;
    const activeIds: any[] = [];
    const items: Array<{ idValue: any; payload: Record<string, any> }> = [];
    let fetchError = false;

    // ── Phase 1: fetch all pages ───────────────────────────────────────────
    while (hasMore) {
        const url = `${perfexEndpoint}/${config.endpoint}?start=${start}&length=${PAGE_SIZE}`;
        console.log(`[Sync/All] Fetching ${config.endpoint} (start=${start}, length=${PAGE_SIZE})`);

        try {
            const res = await fetch(url, {
                headers: { 'authtoken': adminToken, 'Accept': 'application/json' }
            });

            if (!res.ok) {
                console.error(`[Sync/All] ${config.endpoint} page start=${start} returned ${res.status}`);
                fetchError = true;
                break; // stop paginating — do NOT run orphan delete
            }

            const raw = await res.json();
            const chunk: any[] = Array.isArray(raw) ? raw : (raw?.data ?? []);

            if (chunk.length === 0) { hasMore = false; break; }

            for (const item of chunk) {
                const idValue = item[config.idKey];
                activeIds.push(idValue);

                const payload = { ...item };
                // Don't overwrite customfields with an empty array — preserve locally enriched data
                if (config.preserveCustomfields && (!item.customfields || item.customfields.length === 0)) {
                    delete payload.customfields;
                }
                // Drop sensitive fields (e.g. Perfex staff password hash) before storing.
                for (const f of config.omitFields || []) delete payload[f];

                items.push({ idValue, payload });
            }

            hasMore = chunk.length === PAGE_SIZE;
            start += PAGE_SIZE;

        } catch (err: any) {
            console.error(`[Sync/All] Network error on ${config.endpoint} start=${start}:`, err.message);
            fetchError = true;
            break;
        }
    }

    if (items.length === 0) {
        return { synced: false, message: fetchError ? 'Fetch failed' : 'No data from Perfex' };
    }

    // ── Phase 2: diff against stored docs, write ONLY what changed ──────────
    // Perfex returns identical data most syncs; blindly $set-ing every record
    // (plus Mongoose's auto updatedAt) would rewrite every doc every run. Load
    // the current docs once and emit a write only for new or genuinely-changed
    // records — so an unchanged sync does zero writes.
    const existingDocs = await config.model
        .find({ [config.idKey]: { $in: activeIds } })
        .lean();
    const existingMap = new Map<string, any>(
        (existingDocs as any[]).map((d) => [String(d[config.idKey]), d])
    );

    const { ops: allBulkOps, unchanged, changedByField } = buildChangedBulkOps(items, existingMap, config.idKey);

    const writeResult = allBulkOps.length
        ? await config.model.bulkWrite(allBulkOps)
        : { matchedCount: 0, upsertedCount: 0, modifiedCount: 0 };

    console.log(
        `[Sync/All] ${config.endpoint}: ${unchanged}/${items.length} unchanged, ${allBulkOps.length} written.`,
        Object.keys(changedByField).length ? `changed-by-field: ${JSON.stringify(changedByField)}` : ''
    );

    // ── Phase 3: orphan pruning — ONLY if fetch completed without errors ──
    // If any page failed we have an incomplete activeIds list; deleting
    // based on it would incorrectly remove records that still exist in Perfex.
    let deletedCount = 0;
    if (!fetchError && activeIds.length > 0) {
        // For staff, archive the terminated members' compliance data (retention
        // clock) BEFORE pruning their Staff row — never silently orphan it.
        if (config.idKey === 'staffid') {
            const removed = await config.model.find({ staffid: { $nin: activeIds } }).select('staffid').lean();
            await archiveTerminatedStaff(removed.map((s: any) => String(s.staffid)));
        }
        const del = await config.model.deleteMany({ [config.idKey]: { $nin: activeIds } });
        deletedCount = del.deletedCount;
        if (deletedCount > 0) {
            console.log(`[Sync/All] Pruned ${deletedCount} orphaned ${config.endpoint} from local DB.`);
        }
    } else if (fetchError) {
        console.warn(`[Sync/All] Skipping orphan pruning for ${config.endpoint} — fetch was incomplete.`);
    }

    return {
        synced: true,
        totalActive: activeIds.length,
        matched: writeResult.matchedCount,
        upserted: writeResult.upsertedCount,
        modified: writeResult.modifiedCount,
        unchanged,
        deleted: deletedCount,
        partialFetch: fetchError,
    };
}

export async function POST(request: Request) {
    try {
        const perfexEndpoint = process.env.PERFEX_ENDPOINT;
        const adminToken = process.env.PERFEX_ADMIN_TOKEN;

        if (!perfexEndpoint || !adminToken) {
            return NextResponse.json(
                { error: 'Missing PERFEX_ENDPOINT or PERFEX_ADMIN_TOKEN environment variables.' },
                { status: 500 }
            );
        }

        await dbConnect();

        const syncResults: Record<string, any> = {};

        // Run sequentially so we don't hammer Perfex with parallel requests
        for (const [name, config] of Object.entries(RESOURCE_MAP)) {
            try {
                syncResults[name] = await syncResource(config, perfexEndpoint, adminToken);
            } catch (err: any) {
                console.error(`[Sync/All] Fatal error syncing ${name}:`, err.message);
                syncResults[name] = { error: err.message };
            }
        }

        // Heal any accept-before-sync compliance data now that staff rows exist.
        let reconcile = null;
        try {
            reconcile = await reconcileEmailKeyedCompliance();
        } catch (err: any) {
            console.error('[Sync/All] Compliance reconcile failed:', err?.message || err);
        }

        // Refresh the denormalized compliance sort keys on every staff — keeps the
        // "issues first" ordering fresh (incl. expiry drift + targeting changes) and
        // backfills any staff added by this sync.
        try {
            const refreshed = await refreshStaffComplianceStatus();
            console.log(`[Sync/All] Refreshed compliance sort keys for ${refreshed} staff.`);
        } catch (err: any) {
            console.error('[Sync/All] Compliance status refresh failed:', err?.message || err);
        }

        return NextResponse.json({
            success: true,
            message: 'Synchronization process completed.',
            results: syncResults,
            reconcile
        });

    } catch (error: any) {
        console.error('[Sync/All] Fatal error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', details: error.message },
            { status: 500 }
        );
    }
}
