import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { CtaButtons } from "@/components/marketing/MarketingShell";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { locations } from "@/lib/marketing/taxonomy";
import { CONTACT_EMAIL, breadcrumbLd } from "@/lib/seo";

const TITLE = "Service Areas";
const DESC = `Pristine Health provides healthcare staffing for facilities and in-home care for families nationwide. We’re actively serving Washington now and take clients in new locations across the country — if you don’t see your city, just ask.`;

export const metadata: Metadata = {
    title: `Service Areas — Nationwide`,
    description: DESC,
    alternates: { canonical: "/locations" },
    openGraph: { title: `Service Areas — Nationwide`, description: DESC, url: "/locations" },
};

export default function LocationsHub() {
    return (
        <>
            <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: TITLE, path: "/locations" }])} />
            <MarketingHero image="/Pristine%20Health%20Service%20Areas%20Banner%20-%203.png" title="Service areas — nationwide" description={DESC}>
                <CtaButtons className="mt-7" />
            </MarketingHero>
            <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
                <h2 className="text-xl font-black text-text-primary mb-2">Where we’re active now</h2>
                <p className="text-text-secondary mb-6 max-w-2xl">Dedicated pages for our launch market in Washington. We staff and provide care beyond these cities — request your location and we’ll coordinate coverage.</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {locations.map((l) => (
                        <Link key={l.slug} href={`/locations/${l.slug}`} className="rounded-xl border border-border-card bg-surface-card p-5 hover:border-brand-primary/50 transition-colors">
                            <span className="text-lg font-black text-text-primary">{l.city}</span>
                            <span className="block text-sm text-text-muted">{l.region}</span>
                        </Link>
                    ))}
                </div>
                <div className="mt-8 rounded-2xl bg-brand-primary-muted border border-brand-primary/20 p-6 flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <p className="font-black text-text-primary">Don’t see your city?</p>
                        <p className="text-text-secondary text-sm">We take clients nationwide. Tell us where you are and we’ll help.</p>
                    </div>
                    <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Service in my area")}`} className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-sm font-bold bg-brand-primary text-white hover:bg-brand-primary-dark transition-colors">
                        Ask about your area
                    </a>
                </div>
            </section>
        </>
    );
}
