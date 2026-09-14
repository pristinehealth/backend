import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { CtaButtons } from "./MarketingShell";
import { breadcrumbLd, faqLd, serviceLd } from "@/lib/seo";
import type { ServiceEntry } from "@/lib/marketing/taxonomy";

// One service page (facility staffing or home care). Presentational + schema.
export function ServicePage({
    entry,
    basePath,
    rootName,
}: {
    entry: ServiceEntry;
    basePath: string; // "/facility-staffing" | "/home-care"
    rootName: string; // "Facility Staffing" | "Home Care"
}) {
    const path = `${basePath}/${entry.slug}`;
    const ld: Record<string, any>[] = [
        serviceLd({ name: entry.name, description: entry.metaDescription, path }),
        breadcrumbLd([
            { name: "Home", path: "/" },
            { name: rootName, path: basePath },
            { name: entry.name, path },
        ]),
    ];
    if (entry.faqs.length) ld.push(faqLd(entry.faqs));

    return (
        <article>
            <JsonLd data={ld} />
            {/* Hero */}
            <section className="border-b border-border-card bg-surface-card">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 py-14">
                    <nav className="text-[12px] font-semibold text-text-muted mb-4 flex items-center gap-1.5">
                        <Link href="/" className="hover:text-brand-primary">Home</Link><span>/</span>
                        <Link href={basePath} className="hover:text-brand-primary">{rootName}</Link><span>/</span>
                        <span className="text-text-secondary">{entry.name}</span>
                    </nav>
                    <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-text-primary">{entry.h1}</h1>
                    <p className="mt-4 text-lg text-text-secondary leading-relaxed max-w-2xl">{entry.intro}</p>
                    <CtaButtons className="mt-7" />
                </div>
            </section>

            {/* Highlights */}
            {entry.highlights.length > 0 && (
                <section className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
                    <h2 className="text-xl font-black text-text-primary mb-6">What we provide</h2>
                    <ul className="grid sm:grid-cols-2 gap-3">
                        {entry.highlights.map((h) => (
                            <li key={h} className="flex items-start gap-3 rounded-xl border border-border-card bg-surface-card p-4">
                                <span className="mt-0.5 text-brand-primary font-black">✓</span>
                                <span className="text-text-secondary font-medium">{h}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {/* FAQ */}
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

            {/* CTA band */}
            <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-16">
                <div className="rounded-2xl bg-brand-primary-muted border border-brand-primary/20 p-8 text-center">
                    <h2 className="text-2xl font-black text-text-primary">Need {entry.name.toLowerCase()}?</h2>
                    <p className="mt-2 text-text-secondary">Tell us what you need and we’ll respond quickly.</p>
                    <CtaButtons className="mt-6 justify-center" />
                </div>
            </section>
        </article>
    );
}
