/**
 * Shared change-detection for Perfex → MongoDB syncs.
 *
 * Perfex returns identical data on most syncs. Blindly `$set`-ing every record
 * (and letting Mongoose's `timestamps` inject a fresh `updatedAt` into each bulk
 * op) rewrites every document every run — an oplog entry per doc, for nothing.
 * These helpers let a sync write ONLY the records that are new or genuinely
 * changed, so an unchanged sync performs zero writes.
 */

/**
 * Order-independent stringify so two Mixed objects/arrays holding the same data
 * compare equal regardless of key ordering (wire JSON vs BSON round-trip).
 */
export function stableStringify(v: any): string {
    if (v === null || v === undefined) return 'null';
    if (typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
    return (
        '{' +
        Object.keys(v)
            .sort()
            .map((k) => JSON.stringify(k) + ':' + stableStringify(v[k]))
            .join(',') +
        '}'
    );
}

/**
 * Type-tolerant equality. Perfex sends everything as strings; a field cast to a
 * number/bool in the schema would otherwise always look "changed". Primitives
 * compare by string value; objects/arrays by stable stringify.
 */
export function valuesEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    if (typeof a !== 'object' && typeof b !== 'object') return String(a) === String(b);
    return stableStringify(a) === stableStringify(b);
}

/**
 * Does the stored doc differ from the incoming Perfex payload on any field that
 * Perfex actually sends? Only payload keys are compared, so app-managed fields
 * (passwordHash, activeTimer, positionId, timestamps, _id …) are left untouched.
 */
export function needsUpdate(existing: Record<string, any>, payload: Record<string, any>): boolean {
    return firstDifferingKey(existing, payload) !== null;
}

/**
 * The first payload key whose value differs from the stored doc, or null if the
 * record is unchanged. Used to decide whether to write AND to report WHICH field
 * caused it (so a field that churns every sync is easy to spot).
 */
export function firstDifferingKey(
    existing: Record<string, any>,
    payload: Record<string, any>
): string | null {
    for (const key of Object.keys(payload)) {
        if (!valuesEqual(existing[key], payload[key])) return key;
    }
    return null;
}

/**
 * Build bulk `updateOne` ops for only the new/changed records. Given the fetched
 * items and a map of currently-stored docs (keyed by String(idValue)), returns
 * the ops to run plus how many were skipped as unchanged.
 */
export function buildChangedBulkOps(
    items: Array<{ idValue: any; payload: Record<string, any> }>,
    existingMap: Map<string, any>,
    idKey: string
): { ops: any[]; unchanged: number; inserted: number; changedByField: Record<string, number> } {
    const ops: any[] = [];
    let unchanged = 0;
    let inserted = 0;
    // Tally of which field first triggered each update — a field that shows up
    // for nearly every record every sync is churning (schema-dropped field,
    // nested reorder, or type drift), not a real change.
    const changedByField: Record<string, number> = {};
    for (const { idValue, payload } of items) {
        const existing = existingMap.get(String(idValue));
        if (!existing) {
            ops.push({ updateOne: { filter: { [idKey]: idValue }, update: { $set: payload }, upsert: true } });
            inserted++;
            continue;
        }
        const diffKey = firstDifferingKey(existing, payload);
        if (diffKey !== null) {
            ops.push({ updateOne: { filter: { [idKey]: idValue }, update: { $set: payload } } });
            changedByField[diffKey] = (changedByField[diffKey] || 0) + 1;
        } else {
            unchanged++;
        }
    }
    return { ops, unchanged, inserted, changedByField };
}
