import Link from "next/link";

// Shared shell for the intake pages: an image hero band (the homepage photo)
// with breadcrumb + heading, and the form card pulled up over it.
export function RequestPageLayout({
    crumbLabel,
    crumbHref,
    title,
    description,
    children,
}: {
    crumbLabel: string;
    crumbHref: string;
    title: string;
    description: string;
    children: React.ReactNode;
}) {
    return (
        <div className="pb-16">
            <section className="relative overflow-hidden bg-zinc-950">
                <div
                    className="absolute inset-0 bg-cover bg-center opacity-40"
                    style={{ backgroundImage: "url('/healthcare_professionals_diversity.png')" }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/75 via-zinc-950/80 to-zinc-950/95" />
                <div className="absolute -top-16 right-[12%] w-72 h-72 bg-brand-primary/25 rounded-full blur-[130px] pointer-events-none" />
                <div className="relative max-w-2xl mx-auto px-4 sm:px-6 pt-14 pb-24 text-white">
                    <nav className="text-[12px] font-semibold text-white/60 mb-4 flex items-center gap-1.5">
                        <Link href="/" className="hover:text-white">Home</Link><span>/</span>
                        <Link href={crumbHref} className="hover:text-white">{crumbLabel}</Link><span>/</span>
                        <span className="text-white/90">{title}</span>
                    </nav>
                    <h1 className="text-3xl sm:text-4xl font-black tracking-tight">{title}</h1>
                    <p className="mt-3 text-white/80 leading-relaxed max-w-xl">{description}</p>
                </div>
            </section>

            <div className="max-w-2xl mx-auto px-4 sm:px-6 -mt-14 relative z-10">
                <div className="rounded-2xl border border-border-card bg-surface-card p-6 sm:p-8 shadow-2xl">
                    {children}
                </div>
            </div>
        </div>
    );
}
