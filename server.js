// server.js — Custom HTTP server wrapping Next.js + Socket.IO
require('dotenv').config(); // Load .env BEFORE anything reads process.env
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);
const hostname = process.env.HOSTNAME || 'localhost';
// NOTE: JWT_SECRET is read lazily inside the middleware so it always picks
// up the value from .env even after dotenv.config() runs.
const getJwtSecret = () => process.env.JWT_SECRET || 'fallback-dev-secret-please-change-in-prod';

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    const httpServer = createServer((req, res) => {
        const parsedUrl = parse(req.url, true);
        handle(req, res, parsedUrl);
    });

    // ── Socket.IO Setup ───────────────────────────────────────────────────────
    const io = new Server(httpServer, {
        path: '/socket.io',
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
        transports: ['websocket', 'polling'],
    });

    // Attach io to global so API routes can emit via getIO()
    global._io = io;

    // ── JWT Middleware ────────────────────────────────────────────────────────
    // Every connection MUST present a valid JWT in socket.handshake.auth.token.
    // The verified staff_id is stored on socket.data so handlers can trust it.
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) {
            return next(new Error('Authentication required: no token provided'));
        }
        // Debug: log first/last 8 chars of token to confirm it matches what was issued
        console.log(`[Socket.IO] Auth token received: ${token.slice(0, 8)}...${token.slice(-8)}`);
        const secret = getJwtSecret();
        console.log(`[Socket.IO] Verifying with secret: ${secret.slice(0, 6)}... (len=${secret.length})`);
        try {
            const decoded = jwt.verify(token, secret);
            const staffId = decoded.userid || decoded.staffid || decoded.id;
            if (!staffId) return next(new Error('Invalid token: missing staff identity'));
            socket.data.staffId = String(staffId);
            next();
        } catch (err) {
            console.error(`[Socket.IO] JWT verify failed:`, err.message);
            next(new Error('Authentication failed: invalid or expired token'));
        }
    });
    // ─────────────────────────────────────────────────────────────────────────

    io.on('connection', (socket) => {
        // Use the server-verified staffId — the client cannot spoof this
        const staffId = socket.data.staffId;
        socket.join(`staff:${staffId}`);
        console.log(`[Socket.IO] Client ${socket.id} connected → joined room staff:${staffId}`);

        socket.on('disconnect', (reason) => {
            console.log(`[Socket.IO] Client ${socket.id} disconnected (${reason})`);
        });
    });
    // ─────────────────────────────────────────────────────────────────────────

    httpServer.listen(port, async () => {
        console.log(`\n▲ Pristine Health Server ready on http://${hostname}:${port}`);
        console.log(`  Socket.IO attached at ws://${hostname}:${port}/socket.io\n`);

        // ── Startup Config Summary ────────────────────────────────────────────
        const mongoCluster = (process.env.MONGO_URI || '').replace(/\/\/.*@/, '//***@'); // mask credentials
        console.log('[Config] ─────────────────────────────────────────');
        console.log(`[Config]  NODE_ENV       : ${process.env.NODE_ENV || '(unset)'}`);
        console.log(`[Config]  PORT           : ${port}`);
        console.log(`[Config]  PUBLIC_BASE_URL: ${process.env.PUBLIC_BASE_URL || '(unset)'}`);
        console.log(`[Config]  PERFEX_ENDPOINT: ${process.env.PERFEX_ENDPOINT || '(unset)'}`);
        console.log(`[Config]  MONGO_URI      : ${mongoCluster || '(unset)'}`);
        console.log(`[Config]  CORS_ORIGIN    : ${process.env.CORS_ORIGIN || '(unset)'}`);
        console.log(`[Config]  NEXTAUTH_URL   : ${process.env.NEXTAUTH_URL || '(unset)'}`);
        console.log('[Config] ─────────────────────────────────────────\n');
        // ─────────────────────────────────────────────────────────────────────

        // Auto-arm the cron on every boot via the Next.js API layer (avoids direct TS import).
        // Small delay to let Next.js finish initialising its route handlers.
        setTimeout(async () => {
            try {
                // 1. Arm the cron schedule
                const res = await fetch(`http://${hostname}:${port}/api/cron`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'start' }),
                });
                if (res.ok) {
                    console.log('[Server] CronManager auto-started on boot.');
                } else {
                    const body = await res.text();
                    console.warn('[Server] CronManager auto-start returned non-OK:', res.status, body);
                }
            } catch (err) {
                console.warn('[Server] CronManager auto-start failed:', err.message);
            }

            // 2. Fire an immediate startup sync so an empty DB gets populated right away.
            //    This runs fire-and-forget — the server is already serving traffic by now.
            console.log('[Server] Running startup sync (boot hydration)...');
            fetch(`http://${hostname}:${port}/api/sync/all`, { method: 'POST' })
                .then(async (r) => {
                    if (!r.ok) {
                        console.warn(`[Server] Startup sync returned ${r.status}`);
                    } else {
                        const data = await r.json();
                        console.log('[Server] Startup sync complete.', JSON.stringify(data.results));
                    }
                })
                .catch((err) => console.warn('[Server] Startup sync error:', err.message));

        }, 1500); // 1.5 s gives Next.js time to finish warming up
    });
});
