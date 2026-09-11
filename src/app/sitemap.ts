import type { MetadataRoute } from "next";
import { abs } from "@/lib/seo";
import { facilityServices, homeCareServices, locations } from "@/lib/marketing/taxonomy";
import dbConnect from "@/lib/mongoose";
import JobPosition from "@/models/JobPosition";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const now = new Date();

    const staticEntries: MetadataRoute.Sitemap = [
        { url: abs("/"), lastModified: now, changeFrequency: "weekly", priority: 1 },
        { url: abs("/facility-staffing"), lastModified: now, changeFrequency: "weekly", priority: 0.9 },
        { url: abs("/home-care"), lastModified: now, changeFrequency: "weekly", priority: 0.9 },
        { url: abs("/locations"), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
        { url: abs("/request-staffing"), lastModified: now, changeFrequency: "monthly", priority: 0.6 },
        { url: abs("/request-home-care"), lastModified: now, changeFrequency: "monthly", priority: 0.6 },
        { url: abs("/jobs"), lastModified: now, changeFrequency: "daily", priority: 0.8 },
    ];

    const taxonomyEntries: MetadataRoute.Sitemap = [
        ...facilityServices.map((s) => ({ url: abs(`/facility-staffing/${s.slug}`), lastModified: now, changeFrequency: "monthly" as const, priority: 0.8 })),
        ...homeCareServices.map((s) => ({ url: abs(`/home-care/${s.slug}`), lastModified: now, changeFrequency: "monthly" as const, priority: 0.8 })),
        ...locations.map((l) => ({ url: abs(`/locations/${l.slug}`), lastModified: now, changeFrequency: "monthly" as const, priority: 0.6 })),
    ];

    let jobEntries: MetadataRoute.Sitemap = [];
    try {
        await dbConnect();
        const jobs = await JobPosition.find({ status: "open" }).select("_id updatedAt").lean();
        jobEntries = jobs.map((j: any) => ({
            url: abs(`/jobs/${j._id}`),
            lastModified: j.updatedAt || now,
            changeFrequency: "weekly" as const,
            priority: 0.7,
        }));
    } catch {
        // DB unavailable at build/request time — ship the static sitemap anyway.
    }

    return [...staticEntries, ...taxonomyEntries, ...jobEntries];
}
