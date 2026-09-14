import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongoose";
import JobPosition from "@/models/JobPosition";
import { formatLocation } from "@/lib/usStates";
import { JsonLd } from "@/components/JsonLd";
import { abs, breadcrumbLd, jobPostingLd, SITE_NAME } from "@/lib/seo";
import { JobDetailClient, type JobView } from "./JobDetailClient";

export const dynamic = "force-dynamic";

interface JobData extends JobView {
    status: "draft" | "open" | "closed";
}

// One DB read per request, shared by generateMetadata + the page.
const getJob = cache(async (id: string): Promise<JobData | null> => {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    await dbConnect();
    const job = await JobPosition.findById(id).lean<any>();
    if (!job) return null;
    return {
        _id: String(job._id),
        title: job.title,
        location: job.location ?? null,
        city: job.city ?? null,
        sections: (job.sections || []).map((s: any) => ({ label: s.label, content: s.content })),
        imageUrl: job.imageUrl ?? null,
        createdAt: (job.createdAt ? new Date(job.createdAt) : new Date()).toISOString(),
        status: job.status,
    };
});

const escapeHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Google for Jobs requires a `description`; compose one from the sections.
function descriptionHtml(job: JobData): string {
    if (!job.sections.length) return `<p>${escapeHtml(job.title)} — apply with ${escapeHtml(SITE_NAME)}.</p>`;
    return job.sections
        .map((s) => `<h3>${escapeHtml(s.label)}</h3><p>${escapeHtml(s.content).replace(/\n/g, "<br/>")}</p>`)
        .join("");
}

function metaDescription(job: JobData): string {
    const raw = job.sections.map((s) => s.content).join(" ").replace(/\s+/g, " ").trim();
    const loc = formatLocation(job.city, job.location);
    const base = raw || `${job.title} at ${SITE_NAME}${loc ? ` in ${loc}` : ""}.`;
    return base.length > 160 ? `${base.slice(0, 157)}…` : base;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params;
    const job = await getJob(id);
    if (!job || job.status !== "open") return { title: "Job not found", robots: { index: false, follow: false } };
    const path = `/jobs/${job._id}`;
    const loc = formatLocation(job.city, job.location);
    const title = loc ? `${job.title} — ${loc}` : job.title;
    const desc = metaDescription(job);
    return {
        title,
        description: desc,
        alternates: { canonical: path },
        openGraph: { title: `${title} | ${SITE_NAME}`, description: desc, url: path, type: "website", ...(job.imageUrl ? { images: [job.imageUrl] } : {}) },
    };
}

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const job = await getJob(id);
    if (!job || job.status !== "open") notFound();

    const path = `/jobs/${job._id}`;
    const ld = [
        jobPostingLd({
            title: job.title,
            description: descriptionHtml(job),
            datePosted: job.createdAt,
            city: job.city,
            region: job.location,
            image: job.imageUrl && /^https?:\/\//.test(job.imageUrl) ? job.imageUrl : job.imageUrl ? abs(job.imageUrl) : null,
            url: abs(path),
        }),
        breadcrumbLd([
            { name: "Careers", path: "/jobs" },
            { name: job.title, path },
        ]),
    ];

    return (
        <>
            <JsonLd data={ld} />
            <JobDetailClient job={job} />
        </>
    );
}
