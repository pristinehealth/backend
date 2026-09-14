import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// Public marketing + careers are crawlable; the app, intake and API are not.
export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: "*",
                allow: "/",
                disallow: [
                    "/dashboard",
                    "/onboarding",
                    "/login",
                    "/api/",
                    "/jobs/track",
                    "/applications",
                ],
            },
        ],
        sitemap: `${SITE_URL}/sitemap.xml`,
        host: SITE_URL,
    };
}
