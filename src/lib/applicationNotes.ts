// Generic label shown to applicants in place of an internal reviewer's name.
export const CREDENTIAL_TEAM_LABEL = 'Credential team';

interface ApplicationNote {
    author?: string;
    text?: string;
    createdAt?: Date | string;
}

/**
 * Strip reviewer identity from notes before returning them to an applicant.
 * Any note not authored by the applicant themselves is an internal reviewer or
 * system note, so its author collapses to a generic "Credential team" label —
 * the applicant's own notes keep their "Applicant" attribution. This runs at
 * the API boundary so the real reviewer name never leaves the server.
 */
export function sanitizeApplicantNotes(notes: ApplicationNote[] | undefined | null) {
    if (!Array.isArray(notes)) return [];
    return notes.map((note) => ({
        author: note.author === 'Applicant' ? 'Applicant' : CREDENTIAL_TEAM_LABEL,
        text: note.text ?? '',
        createdAt: note.createdAt,
    }));
}
