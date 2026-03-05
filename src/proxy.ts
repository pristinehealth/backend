import { withAuth } from "next-auth/middleware";

// More secure protection via Edge runtime middleware
export default withAuth({
    callbacks: {
        authorized: ({ req, token }) => {
            // Allow access to the API layout and endpoints without local Session block 
            // ONLY IF we explicitly whitelist it here, but we want the dashboard
            // itself to be protected. For now, we protect just the root and /api/staff

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
                pathname.startsWith("/api/sync") // Allow local cron manager to hit sync endpoints
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
});

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
