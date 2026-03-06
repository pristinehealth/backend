/**
 * Centralized Perfex API fetch wrapper.
 *
 * Logs every outgoing call to Perfex with:
 *   [OUT] METHOD /endpoint → <status> <statusText> (<duration>ms)
 *
 * Drop-in replacement for raw fetch() calls to Perfex.
 * Usage:
 *   import { fetchPerfex } from '@/lib/perfex';
 *   const res = await fetchPerfex('/tasks/123', { method: 'PUT', body: JSON.stringify(payload) });
 */

const PERFEX_ENDPOINT = process.env.PERFEX_ENDPOINT!;
const PERFEX_ADMIN_TOKEN = process.env.PERFEX_ADMIN_TOKEN!;

interface FetchPerfexOptions extends RequestInit {
    /** Override the base URL without using PERFEX_ENDPOINT (e.g. for testing) */
    baseUrl?: string;
}

export async function fetchPerfex(path: string, options: FetchPerfexOptions = {}): Promise<Response> {
    const { baseUrl, ...fetchOptions } = options;
    const base = baseUrl ?? PERFEX_ENDPOINT;

    // Normalise: avoid double slashes
    const url = `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
    const method = (fetchOptions.method ?? 'GET').toUpperCase();
    const start = Date.now();

    // Inject auth headers unless the caller already provided them
    const headers = new Headers(fetchOptions.headers);
    if (!headers.has('authtoken')) headers.set('authtoken', PERFEX_ADMIN_TOKEN);
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    // Only inject Content-Type for JSON string bodies.
    // FormData bodies MUST NOT have Content-Type set — the runtime sets the
    // correct multipart/form-data boundary automatically. Overriding it corrupts the boundary.
    if (!headers.has('Content-Type') && typeof fetchOptions.body === 'string') {
        headers.set('Content-Type', 'application/json');
    }

    console.log(`[OUT] ${method} ${url}`);

    let response: Response;
    try {
        response = await fetch(url, { ...fetchOptions, headers });
    } catch (err: any) {
        const elapsed = Date.now() - start;
        console.error(`[OUT] ${method} ${url} → NETWORK ERROR (${elapsed}ms):`, err.message);
        throw err;
    }

    const elapsed = Date.now() - start;
    const logFn = response.ok ? console.log : console.warn;
    logFn(`[OUT] ${method} ${url} → ${response.status} ${response.statusText} (${elapsed}ms)`);

    return response;
}

/**
 * Convenience wrapper: fetch + parse JSON in one call.
 * Throws if response is not ok.
 */
export async function fetchPerfexJson<T = any>(path: string, options: FetchPerfexOptions = {}): Promise<T> {
    const res = await fetchPerfex(path, options);
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Perfex ${options.method ?? 'GET'} ${path} → ${res.status} ${res.statusText}: ${body}`);
    }
    return res.json() as Promise<T>;
}
