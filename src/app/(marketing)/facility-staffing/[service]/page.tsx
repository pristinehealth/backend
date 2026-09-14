import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ServicePage } from "@/components/marketing/ServicePage";
import { facilityServices, getFacilityService } from "@/lib/marketing/taxonomy";

export function generateStaticParams() {
    return facilityServices.map((s) => ({ service: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ service: string }> }): Promise<Metadata> {
    const { service } = await params;
    const entry = getFacilityService(service);
    if (!entry) return {};
    const path = `/facility-staffing/${entry.slug}`;
    return {
        title: entry.metaTitle,
        description: entry.metaDescription,
        keywords: entry.keywords,
        alternates: { canonical: path },
        openGraph: { title: entry.metaTitle, description: entry.metaDescription, url: path },
    };
}

export default async function FacilityServiceRoute({ params }: { params: Promise<{ service: string }> }) {
    const { service } = await params;
    const entry = getFacilityService(service);
    if (!entry) notFound();
    return <ServicePage entry={entry} basePath="/facility-staffing" rootName="Facility Staffing" />;
}
