import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { CtaButtons } from "@/components/marketing/MarketingShell";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { HubGrid } from "@/components/marketing/HubGrid";
import { facilityServices } from "@/lib/marketing/taxonomy";
import { breadcrumbLd, SITE_AREA } from "@/lib/seo";

const TITLE = "Facility Staffing";
const DESC = `Reliable healthcare staffing for nursing homes, assisted living, memory care and skilled nursing facilities across ${SITE_AREA} — CNAs, caregivers, med techs, LPNs, RNs and 1:1 patient support, including short-notice coverage.`;

export const metadata: Metadata = {
    title: `Nationwide Healthcare Facility Staffing Agency`,
    description: DESC,
    alternates: { canonical: "/facility-staffing" },
    openGraph: { title: `Nationwide Healthcare Facility Staffing Agency`, description: DESC, url: "/facility-staffing" },
};

export default function FacilityStaffingHub() {
    return (
        <>
            <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: TITLE, path: "/facility-staffing" }])} />
            <MarketingHero image="/Pristine%20Health%20Facility%20Banner%20-%201.png" eyebrow="For Facilities" title="Dependable healthcare staffing for facilities nationwide" description={DESC}>
                <CtaButtons className="mt-7" />
            </MarketingHero>
            <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
                <h2 className="text-xl font-black text-text-primary mb-6">Staffing services</h2>
                <HubGrid items={facilityServices} basePath="/facility-staffing" />
            </section>
        </>
    );
}
