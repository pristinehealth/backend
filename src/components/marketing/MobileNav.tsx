"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const NAV = [
    { href: "/facility-staffing", label: "Facility Staffing" },
    { href: "/home-care", label: "Home Care" },
    { href: "/locations", label: "Service Areas" },
    { href: "/jobs", label: "Careers" },
];

// Hamburger + slide-in drawer for the marketing header (mobile/tablet only).
export function MobileNav() {
    const [open, setOpen] = useState(false);

    // Lock body scroll while the drawer is open.
    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev; };
    }, [open]);

    const close = () => setOpen(false);

    return (
        <div className="md:hidden">
            <button
                type="button"
                aria-label="Open menu"
                aria-expanded={open}
                onClick={() => setOpen(true)}
                className="p-2 -mr-1 rounded-xl text-text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
                </svg>
            </button>

            {open && (
                <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-up" onClick={close} />
                    <div className="absolute right-0 top-0 h-full w-80 max-w-[82%] bg-surface-card border-l border-border-card shadow-2xl flex flex-col p-6">
                        <div className="flex items-center justify-between mb-6">
                            <span className="font-black text-text-primary">Menu</span>
                            <button type="button" aria-label="Close menu" onClick={close} className="p-2 -mr-1 rounded-xl text-text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                                    <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
                                </svg>
                            </button>
                        </div>

                        <nav className="flex flex-col">
                            {NAV.map((n) => (
                                <Link key={n.href} href={n.href} onClick={close} className="py-3 text-base font-bold text-text-secondary hover:text-brand-primary border-b border-border-card transition-colors">
                                    {n.label}
                                </Link>
                            ))}
                        </nav>

                        <div className="mt-6 flex flex-col gap-3">
                            <Link href="/request-staffing" onClick={close} className="inline-flex items-center justify-center px-5 py-3 rounded-xl text-sm font-bold bg-brand-primary text-white hover:bg-brand-primary-dark transition-colors">
                                Request Staffing
                            </Link>
                            <Link href="/request-home-care" onClick={close} className="inline-flex items-center justify-center px-5 py-3 rounded-xl text-sm font-bold border border-brand-primary/40 text-brand-primary hover:bg-brand-primary-muted transition-colors">
                                Request Home Care
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
