import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LocationPage } from "@/components/marketing/LocationPage";
import { locations, getLocation } from "@/lib/marketing/taxonomy";

export function generateStaticParams() {
    return locations.map((l) => ({ city: l.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ city: string }> }): Promise<Metadata> {
    const { city } = await params;
    const entry = getLocation(city);
    if (!entry) return {};
    const path = `/locations/${entry.slug}`;
    return {
        title: entry.metaTitle,
        description: entry.metaDescription,
        alternates: { canonical: path },
        openGraph: { title: entry.metaTitle, description: entry.metaDescription, url: path },
    };
}

export default async function LocationRoute({ params }: { params: Promise<{ city: string }> }) {
    const { city } = await params;
    const entry = getLocation(city);
    if (!entry) notFound();
    return <LocationPage entry={entry} />;
}
