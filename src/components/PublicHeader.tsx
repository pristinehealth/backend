"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sun, Moon } from "lucide-react";

// Shared top navigation for applicant-facing pages (Careers, Track, Onboarding).
// Mirrors the header on /jobs so the whole public portal feels like one platform.
export function PublicHeader({ label = "Careers" }: { label?: string }) {
    const [theme, setTheme] = useState<'light' | 'dark'>('dark');

    useEffect(() => {
        setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    }, []);

    const toggleTheme = () => {
        const next = theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
        try { localStorage.theme = next; } catch { /* ignore */ }
        document.documentElement.classList.toggle('dark', next === 'dark');
    };

    return (
        <header className="border-b border-sidebar-border backdrop-blur-md bg-sidebar-bg/80 py-4.5 sticky top-0 z-30">
            <div className="max-w-6xl mx-auto px-4 flex justify-between items-center">
                <Link href="/" className="flex items-center gap-2.5 group">
                    <img src="/logo.png" alt="Pristine Health Logo" className="h-10 w-auto brightness-110 dark:brightness-100" />
                    <span className="font-extrabold text-lg text-text-primary tracking-tight border-l border-sidebar-border pl-2.5">{label}</span>
                </Link>
                <div className="flex items-center gap-4">
                    <button
                        onClick={toggleTheme}
                        className="p-2 rounded-xl text-slate-500 hover:bg-slate-200/50 dark:hover:bg-white/[0.05] transition-all"
                        title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
                    >
                        {theme === 'dark' ? <Sun className="h-4.5 w-4.5 text-amber-500" /> : <Moon className="h-4.5 w-4.5 text-indigo-500" />}
                    </button>
                    <Link href="/login?callbackUrl=/dashboard" className="text-xs font-bold ui-subtle-action transition-colors px-4 py-2 rounded-xl">
                        Employee Login
                    </Link>
                </div>
            </div>
        </header>
    );
}
