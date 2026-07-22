// Field types an application form question can render as.
export type CustomFieldType = 'text' | 'paragraph' | 'number' | 'select' | 'checkbox' | 'file' | 'date';

// Legacy forms stored date questions as plain text (e.g. `birth_date` labelled
// "Birth Date (MM/DD/YYYY)"). Detect those by field name so they render as a
// native date picker without needing a data migration. Guarded to `text` only,
// so option-based fields like the `earliest_start_date` dropdown are untouched.
const DATE_NAME = /(^|_)dob$|birth_?date|(^|_)date$/i;

/**
 * The type a field should actually render as. Returns `'date'` for explicit
 * date fields and for legacy date-named text fields; otherwise the field's own
 * type unchanged.
 */
export function resolveFieldType(field: { name: string; type: string }): CustomFieldType {
    if (field.type === 'date') return 'date';
    if (field.type === 'text' && DATE_NAME.test(field.name)) return 'date';
    return field.type as CustomFieldType;
}

/**
 * Coerce a stored value into the `YYYY-MM-DD` a native `<input type="date">`
 * requires. Handles already-ISO dates, ISO datetimes, and legacy `MM/DD/YYYY`
 * strings (from when date questions were free-text). Returns '' if unparseable,
 * so a legacy value simply shows as empty rather than silently breaking input.
 */
export function toDateInputValue(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) return '';
    const v = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const isoDateTime = v.match(/^(\d{4}-\d{2}-\d{2})T/);
    if (isoDateTime) return isoDateTime[1];
    const mdy = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (mdy) {
        const [, m, d, y] = mdy;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return '';
}
