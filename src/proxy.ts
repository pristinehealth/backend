import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from "next-auth/middleware";

// More secure protection via Edge runtime middleware
export default withAuth(
    function middleware(req: NextRequest) {
        const { pathname } = req.nextUrl;
        const method = req.method;
        const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';

        // Log all inbound API requests
        if (pathname.startsWith('/api/')) {
            console.log(`[IN]  ${method} ${pathname} — from ${ip}`);
        }

        return NextResponse.next();
    },
    {
        callbacks: {
            authorized: ({ req, token }) => {
                const { pathname } = req.nextUrl;

                // Unprotected routes:
                if (
                    pathname.startsWith("/login") ||
                    pathname.startsWith("/register") ||
                    pathname.startsWith("/api/auth") ||
                    pathname.startsWith("/api/mobile/auth") ||
                    pathname.startsWith("/api/mobile/tasks") ||
                    pathname.startsWith("/api/mobile/timesheets") ||
                    pathname.startsWith("/api/mobile/profile") ||
                    pathname.startsWith("/api/cron") ||   // Allow server boot auto-start + cron manager
                    pathname.startsWith("/api/sync")      // Allow local cron manager to hit sync endpoints
                ) {
                    return true;
                }

                // Restrict all other routes (like `/` dashboard) to logged in users only
                return !!token;
            },
        },
        pages: {
            signIn: "/login",
        },
    }
);

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public folder resources
         */
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};
