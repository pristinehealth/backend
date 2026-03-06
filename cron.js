require('dotenv').config({ path: '.env' }); // or .env.local if you rely on it
const mongoose = require('mongoose');
const cron = require('node-cron');

// Environment variables
const MONGODB_URI = process.env.MONGO_URI;
const PERFEX_ENDPOINT = process.env.PERFEX_ENDPOINT;
const PERFEX_ADMIN_TOKEN = process.env.PERFEX_ADMIN_TOKEN;

if (!MONGODB_URI || !PERFEX_ENDPOINT || !PERFEX_ADMIN_TOKEN) {
    console.error("Missing required environment variables for the Cron Sync daemon.");
    process.exit(1);
}

// Dynamically create Mongoose Models for schemaless ingestion to bypass Next.js compilation issues
const createDynamicModel = (modelName, collectionName) => {
    const schema = new mongoose.Schema({}, { strict: false, collection: collectionName });
    return mongoose.models[modelName] || mongoose.model(modelName, schema);
};

const Staff = createDynamicModel('Staff', 'staffs');
const Customer = createDynamicModel('Customer', 'customers');
const Project = createDynamicModel('Project', 'projects');
const Task = createDynamicModel('Task', 'tasks');
const Timesheet = createDynamicModel('Timesheet', 'timesheets');

/**
 * Perform a paginated fetch utilizing Perfex DataTables `start` and `length` properties.
 * Loops recursively until it receives a batch smaller than `length`.
 */
async function fetchPaginatedResource(endpoint, identifierKey, Model) {
    console.log(`[Cron] Syncing -> ${Model.modelName}`);
    let start = 0;
    const length = 50;
    let hasMore = true;
    let totalSynced = 0;
    const activeIds = [];
    let fetchError = false;

    while (hasMore) {
        const paginatedUrl = `${PERFEX_ENDPOINT}/${endpoint}?start=${start}&length=${length}`;
        console.log(`[Cron] Fetching Page: ${endpoint} (start=${start}, length=${length})`);

        try {
            const response = await fetch(paginatedUrl, {
                method: 'GET',
                headers: {
                    'authtoken': PERFEX_ADMIN_TOKEN,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                console.error(`[Cron] Failed to fetch ${endpoint} at start=${start}: ${response.statusText}`);
                fetchError = true;
                break; // stop — do NOT orphan-delete with incomplete activeIds
            }

            const rawData = await response.json();
            const chunk = Array.isArray(rawData) ? rawData : (rawData && Array.isArray(rawData.data) ? rawData.data : []);

            if (chunk.length === 0) {
                hasMore = false;
                break;
            }

            const bulkOps = chunk.map(item => {
                const idValue = item[identifierKey];
                activeIds.push(idValue);
                return {
                    updateOne: {
                        filter: { [identifierKey]: idValue },
                        update: { $set: item },
                        upsert: true
                    }
                };
            });

            if (bulkOps.length > 0) {
                await Model.bulkWrite(bulkOps);
                totalSynced += bulkOps.length;
                console.log(`[Cron]     ✔ Synced ${chunk.length} ${Model.modelName}s (Total: ${totalSynced})`);
            }

            if (chunk.length < length) {
                hasMore = false;
            } else {
                start += length;
            }

        } catch (error) {
            console.error(`[Cron] Fatal fetch error during ${endpoint} pagination loop:`, error.message);
            fetchError = true;
            break;
        }
    }

    // Only prune orphans when ALL pages were fetched — a partial activeIds list
    // would incorrectly delete records that still exist in Perfex.
    if (!fetchError && activeIds.length > 0) {
        const deleteResult = await Model.deleteMany({ [identifierKey]: { $nin: activeIds } });
        if (deleteResult.deletedCount > 0) {
            console.log(`[Cron]     🗑️  Deleted ${deleteResult.deletedCount} orphaned ${Model.modelName}s from local cache.`);
        }
    } else if (fetchError) {
        console.warn(`[Cron]     ⚠️  Skipping orphan pruning for ${Model.modelName} — fetch was incomplete.`);
    }

    console.log(`[Cron] ✅  Finished syncing ${Model.modelName}. Total active: ${activeIds.length}\n`);
}

/**
 * Main Execution Sequence
 */
async function runSync() {
    console.log("==========================================");
    console.log(`[Cron] Daemon Started at ${new Date().toISOString()}`);
    console.log("==========================================\n");

    try {
        await mongoose.connect(MONGODB_URI);
        console.log("[Cron] Connected to MongoDB.");

        // Sequentially execute the resources so we don't block out the event loop entirely
        await fetchPaginatedResource('staffs', 'staffid', Staff);
        await fetchPaginatedResource('customers', 'userid', Customer);
        await fetchPaginatedResource('projects', 'id', Project);
        await fetchPaginatedResource('tasks', 'id', Task);
        await fetchPaginatedResource('timesheets', 'id', Timesheet);

        console.log("\n[Cron] 🎉 Global Sync Cycle Successfully Completed.");
    } catch (err) {
        console.error("[Cron] Uncaught execution failure:", err);
    } finally {
        // Disconnect exactly once when gracefully done
        await mongoose.disconnect();
    }
}

// Nightly maintenance sync — hour is configurable via SYNC_HOUR env var (0-23, default 2).
// Write-through persistence means the local DB is already current for all mobile
// write operations (start/stop shift). This is cleanup-only, not the primary read path.
const syncHour = parseInt(process.env.SYNC_HOUR || '2', 10);
console.log(`[Cron] Nightly sync daemon armed. Scheduled for ${String(syncHour).padStart(2, '0')}:00 every night.`);

cron.schedule(`0 ${syncHour} * * *`, () => {
    console.log('[Cron] Nightly maintenance sync triggered.');
    runSync();
});
