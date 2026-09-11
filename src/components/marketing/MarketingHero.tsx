// Image hero for the hub pages: banner background + readable gradient overlay,
// with heading/description and an optional CTA slot on top.
export function MarketingHero({
    image,
    eyebrow,
    title,
    description,
    children,
}: {
    image: string;
    eyebrow?: string;
    title: string;
    description: string;
    children?: React.ReactNode;
}) {
    return (
        <section className="relative overflow-hidden border-b border-border-card">
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${image}')` }} />
            <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/92 via-zinc-950/78 to-zinc-950/45" />
            <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-20 text-white">
                {eyebrow && <p className="text-sm font-black uppercase tracking-wider text-brand-primary-light">{eyebrow}</p>}
                <h1 className="mt-2 text-3xl sm:text-4xl font-black tracking-tight max-w-3xl">{title}</h1>
                <p className="mt-4 text-lg text-white/80 leading-relaxed max-w-2xl">{description}</p>
                {children}
            </div>
        </section>
    );
}
