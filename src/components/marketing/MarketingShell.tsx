import Link from "next/link";
import { CONTACT_EMAIL, SITE_SHORT } from "@/lib/seo";

const NAV = [
    { href: "/facility-staffing", label: "Facility Staffing" },
    { href: "/home-care", label: "Home Care" },
    { href: "/locations", label: "Service Areas" },
];

export const STAFFING_CTA = "/request-staffing";
export const HOMECARE_CTA = "/request-home-care";

export function CtaButtons({ className = "" }: { className?: string }) {
    return (
        <div className={`flex flex-wrap gap-3 ${className}`}>
            <Link href={STAFFING_CTA} className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-sm font-bold bg-brand-primary text-white hover:bg-brand-primary-dark transition-colors">
                Request Staffing
            </Link>
            <Link href={HOMECARE_CTA} className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-sm font-bold border border-brand-primary/40 text-brand-primary hover:bg-brand-primary-muted transition-colors">
                Request Home Care
            </Link>
        </div>
    );
}

function MarketingHeader() {
    return (
        <header className="border-b border-border-card bg-surface-card/80 backdrop-blur sticky top-0 z-30">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
                <Link href="/" className="flex items-center gap-2.5 shrink-0">
                    <img src="/logo.png" alt={`${SITE_SHORT} logo`} className="h-9 w-auto" />
                    <span className="font-black text-text-primary tracking-tight hidden sm:block">{SITE_SHORT}</span>
                </Link>
                <nav className="hidden md:flex items-center gap-6 text-sm font-bold text-text-secondary">
                    {NAV.map((n) => (
                        <Link key={n.href} href={n.href} className="hover:text-brand-primary transition-colors">{n.label}</Link>
                    ))}
                </nav>
                <div className="hidden sm:block"><CtaButtons /></div>
                <a href={STAFFING_CTA} className="sm:hidden px-4 py-2 rounded-xl text-xs font-bold bg-brand-primary text-white">Contact</a>
            </div>
        </header>
    );
}

function MarketingFooter() {
    return (
        <footer className="border-t border-border-card bg-surface-card mt-16">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
                <div className="col-span-2 md:col-span-1">
                    <div className="flex items-center gap-2"><img src="/logo.png" alt="" className="h-8 w-auto" /><span className="font-black text-text-primary">{SITE_SHORT}</span></div>
                    <p className="mt-3 text-text-muted text-[13px] max-w-xs">Healthcare staffing for facilities and personalized in-home care for families — nationwide, starting in Washington.</p>
                </div>
                <div>
                    <p className="text-[11px] font-black uppercase tracking-wider text-text-muted mb-3">Facility Staffing</p>
                    <ul className="space-y-1.5 text-text-secondary">
                        <li><Link href="/facility-staffing/cna" className="hover:text-brand-primary">CNA Staffing</Link></li>
                        <li><Link href="/facility-staffing/1-to-1-support" className="hover:text-brand-primary">1:1 Patient Support</Link></li>
                        <li><Link href="/facility-staffing/assisted-living" className="hover:text-brand-primary">Assisted Living</Link></li>
                        <li><Link href="/facility-staffing" className="hover:text-brand-primary font-semibold">All services →</Link></li>
                    </ul>
                </div>
                <div>
                    <p className="text-[11px] font-black uppercase tracking-wider text-text-muted mb-3">Home Care</p>
                    <ul className="space-y-1.5 text-text-secondary">
                        <li><Link href="/home-care/personal-care" className="hover:text-brand-primary">Personal Care</Link></li>
                        <li><Link href="/home-care/24-hour-care" className="hover:text-brand-primary">24-Hour Care</Link></li>
                        <li><Link href="/home-care/respite-care" className="hover:text-brand-primary">Respite Care</Link></li>
                        <li><Link href="/home-care" className="hover:text-brand-primary font-semibold">All services →</Link></li>
                    </ul>
                </div>
                <div>
                    <p className="text-[11px] font-black uppercase tracking-wider text-text-muted mb-3">Company</p>
                    <ul className="space-y-1.5 text-text-secondary">
                        <li><Link href="/locations" className="hover:text-brand-primary">Service Areas</Link></li>
                        <li><Link href="/jobs" className="hover:text-brand-primary">Careers</Link></li>
                        <li><a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-brand-primary">Contact</a></li>
                    </ul>
                </div>
            </div>
            <div className="border-t border-border-card">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 text-[12px] text-text-muted flex flex-wrap items-center justify-between gap-2">
                    <span>© {new Date().getFullYear()} {SITE_SHORT}. All rights reserved.</span>
                    <span>Serving clients nationwide</span>
                </div>
            </div>
        </footer>
    );
}

export function MarketingShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col">
            <MarketingHeader />
            <main className="flex-1">{children}</main>
            <MarketingFooter />
        </div>
    );
}
