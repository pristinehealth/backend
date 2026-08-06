import mongoose from 'mongoose';
import EmployeeRecord from '@/models/EmployeeRecord';

// Helpers for the person-centric EmployeeRecord hub. Phase 1 uses only the
// email resolver below to dual-write `employeeRecordId` onto applications,
// onboarding records, and documents as they are created. Reads still key on
// applicationId until Phase 2. See docs/employee-record-plan.md.

export function normalizeEmail(email?: string | null): string {
    return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/**
 * Find-or-create the EmployeeRecord for an applicant email and return its `_id`.
 *
 * BEST-EFFORT by design: any failure resolves to `null` so the caller's primary
 * write (submitting an application, uploading a document, …) is never blocked by
 * this dual-write. Rows that miss the id are picked up by migration 012.
 *
 * Identity is email-primary (the chosen policy): we upsert on the normalized
 * email and never touch a record's `staffId` here — staff linkage happens only
 * via the migration's exact-match rules or a manual merge.
 */
export async function resolveEmployeeRecordIdByEmail(
    email: string | null | undefined,
    opts: { name?: string; applicationId?: mongoose.Types.ObjectId | string } = {}
): Promise<mongoose.Types.ObjectId | null> {
    const norm = normalizeEmail(email);
    if (!norm) return null;
    try {
        const update: Record<string, any> = {
            $setOnInsert: {
                email: norm,
                status: 'applicant',
                primaryEmailSource: 'application',
                name: opts.name || '',
            },
        };
        if (opts.applicationId) {
            update.$addToSet = { applicationIds: opts.applicationId };
        }
        const rec = await EmployeeRecord.findOneAndUpdate(
            { email: norm },
            update,
            { upsert: true, new: true, setDefaultsOnInsert: true }
        ).select('_id').lean();
        return (rec as any)?._id ?? null;
    } catch (err: any) {
        // A concurrent upsert can race on the unique email index (E11000); the
        // record exists either way, so fall back to a plain read before giving up.
        try {
            const existing = await EmployeeRecord.findOne({ email: norm }).select('_id').lean();
            if (existing) return (existing as any)._id;
        } catch { /* ignore */ }
        console.error('[employeeRecord] resolve failed for', norm, err?.message || err);
        return null;
    }
}
