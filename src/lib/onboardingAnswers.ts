import { resolveFileReference } from '@/lib/uploadResolve';

// Validate submitted onboarding answers against a questionnaire's field
// definitions. Mirrors the per-type loop in the apply route. `requireAll` is only
// enforced when marking complete — a mid-onboarding save may be partial.
//
// Shared by the admin editor route and the applicant self-service route:
//  - Admin sends a file answer as a stored URL → resolveFileReference passes it
//    through unchanged.
//  - Applicant sends a NEW file answer as a Cloudinary publicId → resolved to the
//    stored URL; an UNCHANGED file comes back as a proxy ref, and `opts.isKeepRef`
//    tells us to keep the previously stored value instead of wiping it.
export async function validateAnswers(
    fields: any[],
    input: Record<string, any>,
    requireAll: boolean,
    opts?: {
        existing?: Record<string, any>;
        isKeepRef?: (value: unknown) => boolean;
    }
): Promise<{ error?: string; values?: Record<string, any> }> {
    const values: Record<string, any> = {};
    for (const field of fields) {
        const val = input[field.name];
        const isEmpty = val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0);

        if (requireAll && field.required && isEmpty) {
            return { error: `"${field.label}" is required` };
        }
        if (isEmpty) continue;

        if (field.type === 'number') {
            const num = Number(val);
            if (Number.isNaN(num)) return { error: `"${field.label}" must be a number` };
            values[field.name] = num;
        } else if (field.type === 'checkbox') {
            if (!Array.isArray(val)) return { error: `"${field.label}" must be a list of selected options` };
            values[field.name] = val;
        } else if (field.type === 'file') {
            // "Keep existing file" — an unchanged file answer echoes back a proxy
            // ref; preserve the previously stored URL rather than re-resolving.
            if (opts?.isKeepRef?.(val)) {
                const prev = opts.existing?.[field.name];
                if (typeof prev === 'string' && prev) values[field.name] = prev;
            } else {
                values[field.name] = await resolveFileReference(val);
            }
        } else {
            values[field.name] = val;
        }
    }
    return { values };
}
