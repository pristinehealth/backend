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
    const length = 50; // Fetch 50 records per chunk
    let hasMore = true;
    let totalSynced = 0;
    const activeIds = [];

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
                break;
            }

            const rawData = await response.json();
            const chunk = Array.isArray(rawData) ? rawData : (rawData && Array.isArray(rawData.data) ? rawData.data : []);

            if (chunk.length === 0) {
                hasMore = false;
                break;
            }

            // Prepare BulkWrite Operations for this chunk
            const bulkOps = chunk.map(item => {
                const idValue = item[identifierKey];
                activeIds.push(idValue); // Track active entities to prune deleted ones later

                return {
                    updateOne: {
                        filter: { [identifierKey]: idValue },
                        update: { $set: item },
                        upsert: true
                    }
                };
            });

            // Execute the bulk write
            if (bulkOps.length > 0) {
                await Model.bulkWrite(bulkOps);
                totalSynced += bulkOps.length;
                console.log(`[Cron]     ✔ Synced ${chunk.length} ${Model.modelName}s (Total: ${totalSynced})`);
            }

            // Check if we reached the absolute end
            if (chunk.length < length) {
                hasMore = false;
            } else {
                start += length; // Increment pagination array offset
            }

        } catch (error) {
            console.error(`[Cron] Fatal fetch error during ${endpoint} pagination loop:`, error.message);
            break;
        }
    }

    // After all pages are ingested, delete local orphan documents that were deleted upstream
    if (activeIds.length > 0) {
        const deleteResult = await Model.deleteMany({ [identifierKey]: { $nin: activeIds } });
        if (deleteResult.deletedCount > 0) {
            console.log(`[Cron]     🗑️  Deleted ${deleteResult.deletedCount} orphaned ${Model.modelName}s from local cache.`);
        }
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

// Start immediately on script boot, then schedule for every 5 minutes
console.log("[Cron] Booting up background synchronization daemon...");
runSync();

cron.schedule('*/5 * * * *', () => {
    runSync();
});
