// Human-friendly job reference derived from the stored sequential refNumber,
// e.g. 7 -> "PHS-0007". Returns null when the job has no number yet (pre-
// backfill), so callers can fall back to the raw id.
export function formatJobRef(refNumber?: number | null): string | null {
    if (refNumber == null || !Number.isFinite(refNumber)) return null;
    return `PHS-${String(refNumber).padStart(4, '0')}`;
}
