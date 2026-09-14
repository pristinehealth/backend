import mongoose from 'mongoose';
import EmployeeRecord, { type EmployeeRecordDocument } from '@/models/EmployeeRecord';

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

/**
 * Find-or-create the EmployeeRecord for a STAFF member (Phase 3 — onboarding a
 * staff member who never applied). Keyed by staffId; if a record already exists
 * for the given email with no staffId, it is linked (exact-email match only,
 * per the email-primary/manual-merge policy). Returns the saved record.
 *
 * Throws only on a genuine save failure; the caller surfaces that to the admin.
 */
export async function resolveEmployeeRecordByStaff(
    staffId: string,
    opts: { email?: string | null; name?: string } = {}
): Promise<EmployeeRecordDocument | null> {
    const sid = String(staffId || '').trim();
    if (!sid) return null;
    const email = normalizeEmail(opts.email);

    let rec = await EmployeeRecord.findOne({ staffId: sid });

    // Link an existing email-keyed record only on exact email match AND only if it
    // isn't already claimed by a different staffId (never auto-merge across staff).
    if (!rec && email) {
        const byEmail = await EmployeeRecord.findOne({ email });
        if (byEmail && !byEmail.staffId) {
            byEmail.staffId = sid;
            rec = byEmail;
        }
    }

    if (!rec) {
        // Drop the email if it's already taken by a different record to keep the
        // unique index clean (that person then needs a manual merge).
        let emailForNew: string | null = email || null;
        if (emailForNew && (await EmployeeRecord.exists({ email: emailForNew }))) emailForNew = null;
        rec = new EmployeeRecord({
            staffId: sid,
            email: emailForNew,
            name: opts.name || '',
            status: 'staff',
            primaryEmailSource: emailForNew ? 'staff' : null,
        });
    }

    if (email && !rec.email) {
        rec.email = email;
        rec.primaryEmailSource = rec.primaryEmailSource || 'manual';
    }
    if (opts.name && !rec.name) rec.name = opts.name;
    if (rec.status !== 'staff') rec.status = 'staff';

    await rec.save();
    return rec;
}
