import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { CtaButtons } from "@/components/marketing/MarketingShell";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { HubGrid } from "@/components/marketing/HubGrid";
import { homeCareServices } from "@/lib/marketing/taxonomy";
import { breadcrumbLd, SITE_AREA } from "@/lib/seo";

const TITLE = "Home Care";
const DESC = `Compassionate in-home care for seniors and families across ${SITE_AREA} — personal care, companion care, respite, dementia support, and 24-hour and overnight care so your loved one can stay safely at home.`;

export const metadata: Metadata = {
    title: `Nationwide In-Home Senior Care`,
    description: DESC,
    alternates: { canonical: "/home-care" },
    openGraph: { title: `Nationwide In-Home Senior Care`, description: DESC, url: "/home-care" },
};

export default function HomeCareHub() {
    return (
        <>
            <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: TITLE, path: "/home-care" }])} />
            <MarketingHero image="/Home%20Care%20Banner.png" eyebrow="For Families" title="Caring in-home support so your loved one can stay home" description={DESC}>
                <CtaButtons className="mt-7" />
            </MarketingHero>
            <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
                <h2 className="text-xl font-black text-text-primary mb-6">Home care services</h2>
                <HubGrid items={homeCareServices} basePath="/home-care" />
            </section>
        </>
    );
}
