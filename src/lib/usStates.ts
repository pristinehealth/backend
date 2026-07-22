// Predefined US states (+ DC) used as the controlled vocabulary for a role's
// location. A fixed list keeps values consistent so we can filter/index on them
// later instead of matching free text.
export const US_STATES = [
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
    'Connecticut', 'Delaware', 'District of Columbia', 'Florida', 'Georgia',
    'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky',
    'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
    'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
    'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota',
    'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island',
    'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
    'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
] as const;

// Non-state options that are still valid role locations.
export const SPECIAL_LOCATIONS = ['Multi-State', 'Remote'] as const;

// The full set an admin can pick from (special options first, then states).
export const LOCATION_OPTIONS: string[] = [...SPECIAL_LOCATIONS, ...US_STATES];

// Whole set as a Set for O(1) validation on the server.
export const LOCATION_SET = new Set<string>(LOCATION_OPTIONS);

/** Compose a display string from an optional city and state, e.g. "Seattle, Washington". */
export function formatLocation(city?: string | null, state?: string | null): string {
    const c = (city || '').trim();
    const s = (state || '').trim();
    if (c && s) return `${c}, ${s}`;
    return s || c || '';
}
