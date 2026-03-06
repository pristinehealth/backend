// src/lib/socket.ts
// Provides a getIO() helper so any Next.js API route can emit Socket.IO events.
// The actual io instance is stored on global._io by server.js.

import type { Server as IOServer } from 'socket.io';

declare global {
    // eslint-disable-next-line no-var
    var _io: IOServer | undefined;
}

/**
 * Returns the active Socket.IO server instance, or a no-op stub when running
 * outside of the custom server context (e.g., during build or in tests).
 */
export function getIO(): IOServer {
    if (global._io) return global._io;

    // Return a safe no-op stub so routes don't crash when io isn't available
    return {
        to: () => ({ emit: () => { } }),
        emit: () => { },
    } as unknown as IOServer;
}
