import Link from "next/link";
import type { ServiceEntry } from "@/lib/marketing/taxonomy";

// Card grid used on the facility-staffing and home-care hub pages.
export function HubGrid({ items, basePath }: { items: ServiceEntry[]; basePath: string }) {
    return (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {items.map((s) => (
                <Link
                    key={s.slug}
                    href={`${basePath}/${s.slug}`}
                    className="group rounded-2xl border border-border-card bg-surface-card p-6 hover:border-brand-primary/50 transition-colors"
                >
                    <h3 className="text-lg font-black text-text-primary group-hover:text-brand-primary transition-colors">{s.name}</h3>
                    <p className="mt-2 text-sm text-text-secondary leading-relaxed line-clamp-3">{s.intro}</p>
                    <span className="mt-4 inline-block text-sm font-bold text-brand-primary">Learn more →</span>
                </Link>
            ))}
        </div>
    );
}
