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

                // Public routes — no auth required:
                if (
                    pathname === "/" ||                          // Landing page
                    pathname.startsWith("/jobs") ||             // Public job listings
                    pathname.startsWith("/login") ||
                    pathname.startsWith("/register") ||
                    pathname.startsWith("/forgot-password") || // Public admin password-reset page
                    pathname.startsWith("/api/auth") ||         // Incl. forgot-password + reset-password APIs
                    pathname.startsWith("/api/jobs") ||         // Public jobs API
                    pathname.startsWith("/api/applications") || // Candidates applying
                    pathname === "/api/contact" ||              // Public contact form (NOT /api/contacts, which is admin)
                    pathname.startsWith("/api/contact/") ||
                    pathname.startsWith("/api/upload") ||       // Public file uploads (applicants)
                    pathname.startsWith("/api/mobile/auth") ||
                    pathname.startsWith("/api/mobile/tasks") ||
                    pathname.startsWith("/api/mobile/timesheets") ||
                    pathname.startsWith("/api/mobile/profile") ||
                    pathname.startsWith("/api/cron") ||         // Server boot auto-start + cron manager
                    pathname.startsWith("/api/sync")            // Local cron manager sync endpoints
                ) {
                    return true;
                }

                // Everything else (admin dashboard, admin APIs) requires a valid session
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
