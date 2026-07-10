"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    Briefcase, ChevronRight, Loader2,
    Lock, Moon, Sun, ChevronLeft, ArrowRight, MapPin, Clock, ShieldCheck, Sparkles
} from "lucide-react";

interface CustomField {
    name: string;
    label: string;
    type: 'text' | 'paragraph' | 'number' | 'select' | 'checkbox' | 'file';
    required: boolean;
    options?: string[];
}

interface JobSection {
    label: string;
    content: string;
}

interface JobPosition {
    _id: string;
    title: string;
    sections: JobSection[];
    status: 'open' | 'closed';
    customFields: CustomField[];
    createdAt: string;
}

const JOBS_PER_PAGE = 5;

export default function CareersPage() {
    const router = useRouter();
    const [jobs, setJobs] = useState<JobPosition[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);

    // Track application status states
    const [trackEmail, setTrackEmail] = useState("");

    const [theme, setTheme] = useState<'light' | 'dark'>('dark');

    // Initialize theme and load jobs
    useEffect(() => {
        const isDark = document.documentElement.classList.contains('dark');
        setTheme(isDark ? 'dark' : 'light');
        fetchJobs();
    }, []);

    const toggleTheme = () => {
        const nextTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(nextTheme);
        localStorage.theme = nextTheme;
        if (nextTheme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    };

    const fetchJobs = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/jobs');
            const data = await res.json();
            setJobs(data);
        } catch (err) {
            console.error("Failed to fetch jobs", err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleTrackSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!trackEmail) return;

        router.push(`/jobs/track?email=${encodeURIComponent(trackEmail)}`);
    };

    // Pagination calculations
    const totalPages = Math.ceil(jobs.length / JOBS_PER_PAGE);
    const startIndex = (currentPage - 1) * JOBS_PER_PAGE;
    const paginatedJobs = jobs.slice(startIndex, startIndex + JOBS_PER_PAGE);

    const handlePageChange = (page: number) => {
        if (page >= 1 && page <= totalPages) {
            setCurrentPage(page);
        }
    };

    return (
        <div className="min-h-screen bg-background text-foreground relative overflow-hidden flex flex-col font-sans transition-colors duration-300">
            
            {/* Ambient Background Glows matching brand */}
            <div className="absolute top-[-300px] left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-brand-primary-muted rounded-full blur-[150px] pointer-events-none opacity-45"></div>
            <div className="absolute bottom-[-200px] right-[10%] w-[500px] h-[400px] bg-brand-accent-muted rounded-full blur-[130px] pointer-events-none opacity-30"></div>

            {/* Subtle Grid Overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.012)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.012)_1px,transparent_1px)] bg-[size:56px_56px] pointer-events-none"></div>

            {/* Header */}
            <header className="relative border-b border-sidebar-border backdrop-blur-md bg-sidebar-bg/80 py-4.5 z-10 shrink-0">
                <div className="max-w-6xl mx-auto px-4 flex justify-between items-center">
                    <Link href="/" className="flex items-center gap-2.5 group">
                        <img src="/logo.png" alt="Pristine Health Logo" className="h-10 w-auto brightness-110 dark:brightness-100" />
                        <span className="font-extrabold text-lg text-text-primary tracking-tight border-l border-sidebar-border pl-2.5">Careers</span>
                    </Link>

                    <div className="flex items-center gap-4">
                        {/* Dark mode switcher */}
                        <button
                            onClick={toggleTheme}
                            className="p-2 rounded-xl text-slate-500 hover:bg-slate-200/50 dark:hover:bg-white/[0.05] transition-all"
                            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
                        >
                            {theme === 'dark' ? <Sun className="h-4.5 w-4.5 text-amber-500" /> : <Moon className="h-4.5 w-4.5 text-indigo-500" />}
                        </button>

                        <Link 
                            href="/login?callbackUrl=/dashboard" 
                            className="text-xs font-bold ui-subtle-action transition-colors px-4 py-2 rounded-xl"
                        >
                            Employee Login
                        </Link>
                    </div>
                </div>
            </header>

            {/* Hero band */}
            <section className="relative z-10 border-b border-sidebar-border">
                <div className="max-w-6xl mx-auto px-4 py-14 md:py-16">
                    <div className="max-w-2xl space-y-4 animate-fade-up">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-primary-muted text-brand-primary text-xs font-bold uppercase tracking-wider border border-brand-primary/15">
                            <Sparkles className="h-3.5 w-3.5" /> Careers at Pristine Health
                        </span>
                        <h1 className="text-3xl md:text-5xl font-black text-text-primary tracking-tight leading-[1.08]">
                            Join a team that puts <span className="text-brand-primary">care first.</span>
                        </h1>
                        <p className="text-text-secondary leading-relaxed md:text-lg">
                            Credentialed, compassionate professionals power everything we do. Explore open positions across facility staffing and in-home care.
                        </p>
                        <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1 text-sm text-text-muted">
                            <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-brand-primary" /> Credentialed & compliant</span>
                            <span className="flex items-center gap-2"><Clock className="h-4 w-4 text-brand-primary" /> Flexible shifts</span>
                            <span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-brand-primary" /> Washington State</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Main Content */}
            <main className="relative flex-1 max-w-6xl w-full mx-auto px-4 py-12 z-10 grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Column 1 & 2: Careers Board */}
                <div className="lg:col-span-2 space-y-5">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-black text-text-primary tracking-tight">Open Positions</h2>
                        {!isLoading && jobs.length > 0 && (
                            <span className="text-xs font-bold text-text-muted bg-surface-card border border-border-card rounded-full px-3 py-1">
                                {jobs.length} open
                            </span>
                        )}
                    </div>

                    {isLoading ? (
                        <div className="flex justify-center py-20">
                            <Loader2 className="h-8 w-8 text-brand-primary animate-spin" />
                        </div>
                    ) : jobs.length === 0 ? (
                        <div className="crm-panel p-10 rounded-2xl text-center space-y-3">
                            <Briefcase className="h-8 w-8 mx-auto text-text-muted" />
                            <p className="text-text-secondary font-semibold">No open positions right now</p>
                            <p className="text-xs text-text-muted">We're not hiring at the moment — check back soon, or track an existing application on the right.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {paginatedJobs.map((job, i) => (
                                <div
                                    key={job._id}
                                    onClick={() => router.push(`/jobs/${job._id}`)}
                                    style={{ animationDelay: `${i * 60}ms` }}
                                    className="animate-fade-up crm-panel hover:border-brand-primary/40 hover:-translate-y-0.5 p-5 rounded-2xl cursor-pointer flex items-center gap-4 group transition-all duration-300"
                                >
                                    <div className="h-12 w-12 shrink-0 rounded-2xl bg-brand-primary-muted border border-brand-primary/15 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <Briefcase className="h-5 w-5 text-brand-primary" />
                                    </div>
                                    <div className="min-w-0 flex-1 space-y-1.5">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="font-black text-base text-text-primary group-hover:text-brand-primary transition-colors truncate">{job.title}</h3>
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">Open</span>
                                        </div>
                                        <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">{job.sections?.[0]?.content}</p>
                                        <span className="inline-block text-[10px] text-text-muted font-mono">Posted {new Date(job.createdAt).toLocaleDateString()}</span>
                                    </div>
                                    <span className="hidden sm:inline-flex items-center gap-1 text-xs font-bold text-brand-primary opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all shrink-0">
                                        View <ArrowRight className="h-4 w-4" />
                                    </span>
                                    <ChevronRight className="sm:hidden h-5 w-5 text-text-muted shrink-0" />
                                </div>
                            ))}

                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                                <div className="flex justify-center items-center gap-2 pt-6">
                                    <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className="p-2 rounded-lg ui-subtle-action disabled:opacity-30 transition-all" title="Previous Page">
                                        <ChevronLeft className="h-4 w-4" />
                                    </button>
                                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                        <button key={page} onClick={() => handlePageChange(page)} className={`h-8 w-8 text-xs font-bold rounded-lg transition-all border ${currentPage === page ? "bg-brand-primary text-white border-brand-primary" : "ui-subtle-action"}`}>
                                            {page}
                                        </button>
                                    ))}
                                    <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} className="p-2 rounded-lg ui-subtle-action disabled:opacity-30 transition-all" title="Next Page">
                                        <ChevronRight className="h-4 w-4" />
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Column 3: Check Status Tracker Widget */}
                <div className="space-y-6">
                    <div className="crm-panel rounded-2xl p-5 md:p-6 shadow-xl lg:sticky lg:top-24">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="h-9 w-9 rounded-xl bg-brand-primary-muted border border-brand-primary/15 flex items-center justify-center">
                                <Lock className="h-4 w-4 text-brand-primary" />
                            </div>
                            <h3 className="font-black text-sm text-text-primary">Track your application</h3>
                        </div>
                        <p className="text-xs text-text-muted leading-relaxed mb-5">
                            Enter your email to receive a one-time verification code and securely access your applications.
                        </p>
                        <form onSubmit={handleTrackSubmit} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold ui-muted uppercase tracking-wider">Your Email</label>
                                <input
                                    type="email"
                                    required
                                    value={trackEmail}
                                    onChange={e => setTrackEmail(e.target.value)}
                                    placeholder="jane.doe@example.com"
                                    className="w-full text-xs bg-bg-input border border-border-input rounded-xl px-3.5 py-2.5 text-text-input outline-none focus:border-brand-primary transition-colors"
                                />
                            </div>
                            <button type="submit" className="w-full bg-brand-primary hover:bg-brand-primary-dark text-white font-bold text-xs py-2.5 rounded-xl shadow-md shadow-brand-primary/10 active:scale-[0.98] transition-all flex justify-center items-center gap-1.5">
                                Continue Securely <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                        </form>
                    </div>
                </div>
            </main>
        </div>
    );
}
