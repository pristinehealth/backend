import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { CtaButtons } from "./MarketingShell";
import { breadcrumbLd, faqLd, localBusinessLd } from "@/lib/seo";
import { facilityServices, homeCareServices, type LocationEntry } from "@/lib/marketing/taxonomy";

// One city hub page. Cross-links both service systems + LocalBusiness schema.
export function LocationPage({ entry }: { entry: LocationEntry }) {
    const path = `/locations/${entry.slug}`;
    const ld: Record<string, any>[] = [
        localBusinessLd({ city: entry.city, region: entry.region, path, description: entry.metaDescription }),
        breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Service Areas", path: "/locations" },
            { name: `${entry.city}, ${entry.region}`, path },
        ]),
    ];
    if (entry.faqs.length) ld.push(faqLd(entry.faqs));

    return (
        <article>
            <JsonLd data={ld} />
            <section className="border-b border-border-card bg-surface-card">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 py-14">
                    <nav className="text-[12px] font-semibold text-text-muted mb-4 flex items-center gap-1.5">
                        <Link href="/" className="hover:text-brand-primary">Home</Link><span>/</span>
                        <Link href="/locations" className="hover:text-brand-primary">Service Areas</Link><span>/</span>
                        <span className="text-text-secondary">{entry.city}</span>
                    </nav>
                    <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-text-primary">
                        Healthcare Staffing &amp; Home Care in {entry.city}, {entry.region}
                    </h1>
                    <p className="mt-4 text-lg text-text-secondary leading-relaxed max-w-2xl">{entry.intro}</p>
                    <CtaButtons className="mt-7" />
                </div>
            </section>

            <section className="max-w-4xl mx-auto px-4 sm:px-6 py-12 grid md:grid-cols-2 gap-8">
                <div>
                    <h2 className="text-xl font-black text-text-primary mb-4">Facility Staffing in {entry.city}</h2>
                    <ul className="space-y-2">
                        {facilityServices.map((s) => (
                            <li key={s.slug}>
                                <Link href={`/facility-staffing/${s.slug}`} className="text-text-secondary hover:text-brand-primary font-medium">{s.name}</Link>
                            </li>
                        ))}
                    </ul>
                </div>
                <div>
                    <h2 className="text-xl font-black text-text-primary mb-4">Home Care in {entry.city}</h2>
                    <ul className="space-y-2">
                        {homeCareServices.map((s) => (
                            <li key={s.slug}>
                                <Link href={`/home-care/${s.slug}`} className="text-text-secondary hover:text-brand-primary font-medium">{s.name}</Link>
                            </li>
                        ))}
                    </ul>
                </div>
            </section>

            {entry.faqs.length > 0 && (
                <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-12">
                    <h2 className="text-xl font-black text-text-primary mb-6">Frequently asked questions</h2>
                    <div className="space-y-4">
                        {entry.faqs.map((f) => (
                            <div key={f.q} className="rounded-xl border border-border-card bg-surface-card p-5">
                                <h3 className="font-bold text-text-primary">{f.q}</h3>
                                <p className="mt-2 text-text-secondary leading-relaxed">{f.a}</p>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-16">
                <div className="rounded-2xl bg-brand-primary-muted border border-brand-primary/20 p-8 text-center">
                    <h2 className="text-2xl font-black text-text-primary">Serving {entry.city} &amp; nearby communities</h2>
                    <p className="mt-2 text-text-secondary">Request staffing for your facility or home care for your loved one.</p>
                    <CtaButtons className="mt-6 justify-center" />
                </div>
            </section>
        </article>
    );
}
