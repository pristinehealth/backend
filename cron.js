require('dotenv').config({ path: '.env' }); // or .env.local if you rely on it
const mongoose = require('mongoose');
const cron = require('node-cron');
const { v2: cloudinary } = require('cloudinary');

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

cloudinary.config({ secure: true });

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
                // Never store Perfex's staff credential hash — the app doesn't use it.
                if (Model.modelName === 'Staff') delete item.password;
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
        // For staff, archive terminated members' compliance data (retention
        // clock) BEFORE deleting their Staff row — never silently orphan it.
        if (identifierKey === 'staffid') {
            const removed = await Model.find({ staffid: { $nin: activeIds } }).select('staffid').lean();
            const ids = removed.map((s) => String(s.staffid));
            if (ids.length) {
                const now = new Date();
                const StaffDocument = createDynamicModel('StaffDocument', 'staffdocuments');
                const StaffComplianceRecord = createDynamicModel('StaffComplianceRecord', 'staffcompliancerecords');
                await StaffDocument.updateMany({ staffId: { $in: ids }, archivedAt: null }, { $set: { archivedAt: now } });
                await StaffComplianceRecord.updateMany({ staffId: { $in: ids }, archivedAt: null }, { $set: { archivedAt: now } });
                console.log(`[Cron]     🗄️  Archived compliance data for ${ids.length} terminated staff.`);
            }
        }
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

/**
 * Check for expiring staff documents and send reminder emails
 */
async function checkDocumentExpiries() {
    console.log("[Cron] Document expiry check started...");

    try {
        const StaffDocument = createDynamicModel('StaffDocument', 'staffdocuments');
        const User = createDynamicModel('User', 'users');

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // Find documents expiring in 30 days, 7 days, or already expired
        const documentsToCheck = await StaffDocument.find({
            expiryDate: { $exists: true, $ne: null },
            status: { $in: ['active', 'pending_renewal'] }
        }).lean();

        let remindersSent = 0;

        for (const doc of documentsToCheck) {
            if (!doc.expiryDate) continue;

            const expiryDate = new Date(doc.expiryDate);
            const expiryDay = new Date(expiryDate.getFullYear(), expiryDate.getMonth(), expiryDate.getDate());
            const daysUntilExpiry = Math.floor((expiryDay - today) / (1000 * 60 * 60 * 24));

            let shouldSendReminder = false;
            let reminderType = '';

            // Check if 30 days before expiry
            if (daysUntilExpiry === 30 && (!doc.lastReminderSentAt || new Date(doc.lastReminderSentAt) < new Date(today.getTime() - 24*60*60*1000))) {
                shouldSendReminder = true;
                reminderType = '30_days_before';
            }
            // Check if 7 days before expiry
            else if (daysUntilExpiry === 7 && (!doc.lastReminderSentAt || new Date(doc.lastReminderSentAt) < new Date(today.getTime() - 24*60*60*1000))) {
                shouldSendReminder = true;
                reminderType = '7_days_before';
            }
            // Check if expired
            else if (daysUntilExpiry <= 0 && doc.status === 'active') {
                shouldSendReminder = true;
                reminderType = 'expired';
                // Update status to expired
                await StaffDocument.updateOne({ _id: doc._id }, { status: 'expired' });
            }

            if (shouldSendReminder) {
                // Get staff member email
                const staff = await User.findOne({ email: doc.staffEmail }).select('email firstname').lean();
                if (staff && staff.email) {
                    try {
                        // Send reminder email via internal API
                        const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/mail/document-expiry-reminder`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                to: staff.email,
                                staffName: staff.firstname || 'Staff Member',
                                documentType: doc.documentType,
                                expiryDate: doc.expiryDate,
                                daysUntilExpiry
                            })
                        });

                        if (response.ok) {
                            // Update lastReminderSentAt
                            await StaffDocument.updateOne({ _id: doc._id }, { lastReminderSentAt: now });
                            remindersSent++;
                            console.log(`[Cron] Sent ${reminderType} reminder for ${doc.documentType} to ${staff.email}`);
                        }
                    } catch (err) {
                        console.error(`[Cron] Failed to send reminder for document ${doc._id}:`, err);
                    }
                }
            }
        }

        console.log(`[Cron] Document expiry check completed. ${remindersSent} reminders sent.`);
    } catch (err) {
        console.error("[Cron] Error during document expiry check:", err);
    }
}

async function deleteCloudinaryAsset(publicId) {
    const resourceTypes = ['image', 'raw', 'video'];
    for (const resourceType of resourceTypes) {
        try {
            const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
            if (result?.result === 'ok' || result?.result === 'not found') {
                return true;
            }
        } catch {
            // Try next type
        }
    }
    return false;
}

async function cleanupAbandonedApplicationUploads() {
    console.log('[Cron] Pending upload cleanup started...');
    try {
        const UploadAsset = createDynamicModel('UploadAsset', 'uploadassets');
        const now = new Date();

        const staleUploads = await UploadAsset.find({
            status: 'pending',
            expiresAt: { $lte: now },
        }).lean();

        if (!staleUploads.length) {
            console.log('[Cron] Pending upload cleanup completed. No stale uploads found.');
            return;
        }

        let deletedCount = 0;
        for (const upload of staleUploads) {
            const removed = await deleteCloudinaryAsset(upload.publicId);
            if (removed) {
                await UploadAsset.updateOne(
                    { _id: upload._id },
                    {
                        $set: {
                            status: 'deleted',
                            deletedAt: now,
                        },
                    }
                );
                deletedCount += 1;
            }
        }

        console.log(`[Cron] Pending upload cleanup completed. Deleted ${deletedCount}/${staleUploads.length} stale assets.`);
    } catch (err) {
        console.error('[Cron] Pending upload cleanup failed:', err);
    }
}

// Daily document expiry check — runs at 8 AM UTC
cron.schedule('0 8 * * *', async () => {
    console.log('[Cron] Daily document expiry check triggered.');
    try {
        await mongoose.connect(MONGODB_URI);
        await checkDocumentExpiries();
        await cleanupAbandonedApplicationUploads();
    } catch (err) {
        console.error('[Cron] Document expiry check failed:', err);
    } finally {
        await mongoose.disconnect();
    }
});
