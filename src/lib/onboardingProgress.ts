/**
 * Candidate-level onboarding roll-up.
 *
 * A candidate can be assigned several questionnaires (general screening,
 * background check, …), each stored as its own OnboardingResponse. There is no
 * stored candidate-level status — it is always derived from that set, so every
 * surface agrees. Both the onboarding list (/api/admin/onboarding) and the staff
 * profile badge (/api/admin/staff/[staffId]/onboarding) call this.
 *
 * Every assigned questionnaire counts: a candidate is only `completed` once all
 * of them are. If one does not apply to a candidate, remove it from their packet
 * rather than leaving it unfinished.
 */

export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed';

/** The subset of an OnboardingResponse this module needs. */
export interface OnboardingProgressInput {
    status?: string;
    answeredCount?: number;
    totalCount?: number;
}

export interface OnboardingProgress {
    status: OnboardingStatus;
    /** Questionnaires marked complete. */
    done: number;
    /** Questionnaires assigned. */
    total: number;
    /** Questions answered across the whole packet. */
    answered: number;
    /** Questions in the whole packet. */
    answerable: number;
    /** Whole-packet completion, 0–100, by questions answered (not questionnaires). */
    percent: number;
}

export function rollUpOnboarding(responses: OnboardingProgressInput[]): OnboardingProgress {
    const total = responses.length;
    const done = responses.filter((r) => r.status === 'completed').length;
    const answered = responses.reduce((sum, r) => sum + (r.answeredCount || 0), 0);
    const answerable = responses.reduce((sum, r) => sum + (r.totalCount || 0), 0);

    // A questionnaire marked complete counts as fully answered even if its
    // counters predate this feature (they backfill to 0), so an all-complete
    // packet never shows a partial bar.
    const percent = total === 0
        ? 0
        : done === total
            ? 100
            : answerable === 0
                ? Math.round((done / total) * 100)
                : Math.round((answered / answerable) * 100);

    const status: OnboardingStatus = total === 0
        ? 'not_started'
        : done === total
            ? 'completed'
            : 'in_progress';

    return { status, done, total, answered, answerable, percent };
}
