"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Briefcase, Loader2, Moon, Sun, Clock, ShieldCheck, MapPin, CheckCircle2, Sparkles } from "lucide-react";
import { formatLocation } from "@/lib/usStates";

interface JobSection {
  label: string;
  content: string;
}

interface JobPosition {
  _id: string;
  title: string;
  location?: string | null;
  city?: string | null;
  sections: JobSection[];
  status: 'open' | 'closed';
  imageUrl?: string | null;
  createdAt: string;
}

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const [job, setJob] = useState<JobPosition | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setTheme(isDark ? 'dark' : 'light');
    fetchJobDetails();
  }, [id]);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.theme = nextTheme;
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
  };

  const fetchJobDetails = async () => {
    setIsLoading(true);
    setPageError("");
    try {
      const res = await fetch(`/api/jobs/${id}`);
      const data = await res.json();
      if (res.ok) {
        setJob(data);
      } else {
        setPageError(data.error || "Failed to load job details.");
      }
    } catch (err) {
      console.error("Error fetching job details:", err);
      setPageError("Connection error while loading job info.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <Loader2 className="h-10 w-10 text-brand-primary animate-spin" />
      </div>
    );
  }

  if (pageError || !job) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4">
        <p className="text-sm text-text-muted mb-6 text-center max-w-sm">
          {pageError || "The requested job position could not be found or has closed."}
        </p>
        <Link 
          href="/jobs" 
          className="bg-brand-primary hover:bg-brand-primary-dark text-white font-bold text-sm px-6 py-2.5 rounded-xl transition-all"
        >
          Back to Careers Page
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden flex flex-col font-sans transition-colors duration-300">
      <div className="absolute top-[-300px] left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-brand-primary-muted rounded-full blur-[150px] pointer-events-none opacity-45"></div>
      <div className="absolute bottom-[-200px] right-[10%] w-[500px] h-[400px] bg-brand-accent-muted rounded-full blur-[130px] pointer-events-none opacity-30"></div>
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.012)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.012)_1px,transparent_1px)] bg-[size:56px_56px] pointer-events-none"></div>

      <header className="relative border-b border-sidebar-border backdrop-blur-md bg-sidebar-bg/85 py-4.5 z-10 shrink-0">
        <div className="max-w-4xl mx-auto px-4 flex justify-between items-center">
          <Link href="/jobs" className="flex items-center gap-2.5 group">
            <img src="/logo.png" alt="Pristine Health Logo" className="h-10 w-auto brightness-110 dark:brightness-100" />
            <span className="font-extrabold text-lg text-text-primary tracking-tight border-l border-sidebar-border pl-2.5">Careers</span>
          </Link>

          <div className="flex items-center gap-4">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl text-slate-500 hover:bg-slate-200/50 dark:hover:bg-white/[0.05] transition-all"
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            >
              {theme === 'dark' ? <Sun className="h-4.5 w-4.5 text-amber-500" /> : <Moon className="h-4.5 w-4.5 text-indigo-500" />}
            </button>

            <button
              type="button"
              onClick={() => router.push(`/jobs/${job._id}/apply`)}
              className="bg-brand-primary hover:bg-brand-primary-dark text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-brand-primary/20 flex items-center gap-1.5 active:scale-95"
            >
              Apply Now <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Hero band */}
      <section className="relative z-10 border-b border-sidebar-border overflow-hidden">
        <div className="absolute -top-16 right-[15%] w-72 h-72 bg-brand-primary/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="max-w-5xl mx-auto px-4 py-10 md:py-14 relative">
          <button
            onClick={() => router.push("/jobs")}
            className="flex items-center gap-1.5 text-sm font-bold text-text-muted hover:text-text-primary transition-all mb-6"
          >
            <ArrowLeft className="h-4.5 w-4.5" /> Back to open positions
          </button>
          <div className="space-y-4 animate-fade-up max-w-3xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider border border-emerald-500/20">
              <Briefcase className="h-3.5 w-3.5" /> Now Hiring — Open Position
            </span>
            <h1 className="text-3xl md:text-5xl font-black text-text-primary tracking-tight leading-[1.08]">{job.title}</h1>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-text-muted">
              <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-brand-primary" /> Credentialed role</span>
              <span className="flex items-center gap-2"><Clock className="h-4 w-4 text-brand-primary" /> Posted {new Date(job.createdAt).toLocaleDateString()}</span>
              <span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-brand-primary" /> {formatLocation(job.city, job.location) || 'Multi-State'}</span>
            </div>
          </div>
        </div>
      </section>

      <main className="relative flex-1 max-w-5xl w-full mx-auto px-4 py-10 z-10 grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Sections */}
        <div className="lg:col-span-2 space-y-4">
          {job.sections && job.sections.length > 0 ? (
            job.sections.map((sec, idx) => (
              <div
                key={idx}
                style={{ animationDelay: `${idx * 60}ms` }}
                className="animate-fade-up crm-panel p-6 rounded-2xl space-y-2.5"
              >
                <h3 className="text-xs font-black text-brand-primary uppercase tracking-widest flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" /> {sec.label}
                </h3>
                <p className="leading-relaxed whitespace-pre-line text-base ui-body font-medium">{sec.content}</p>
              </div>
            ))
          ) : (
            <div className="crm-panel p-6 rounded-2xl text-text-muted text-sm">No further details provided for this role.</div>
          )}
        </div>

        {/* Sticky apply sidebar */}
        <aside className="lg:sticky lg:top-24 space-y-4">
          {job.imageUrl && (
            <div className="animate-fade-up overflow-hidden rounded-2xl border border-border-card shadow-lg">
              <img src={job.imageUrl} alt={job.title} className="w-full h-80 md:h-96 object-cover" />
            </div>
          )}
          <div className="crm-panel rounded-2xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-primary" />
              <h3 className="text-sm font-black text-text-primary">Ready to apply?</h3>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              Applying takes just a few minutes. You'll be able to track your status any time with your email.
            </p>
            <div className="space-y-2">
              {["Quick guided application", "Secure document upload", "Track status with your email"].map((t) => (
                <span key={t} className="flex items-center gap-2 text-xs text-text-secondary">
                  <CheckCircle2 className="h-4 w-4 text-brand-primary shrink-0" /> {t}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={() => router.push(`/jobs/${job._id}/apply`)}
              className="w-full bg-brand-primary hover:bg-brand-primary-dark text-white font-bold text-sm py-3 rounded-xl shadow-lg shadow-brand-primary/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
            >
              Apply Now <ArrowRight className="h-4 w-4" />
            </button>
            <Link href="/jobs/track" className="block text-center text-xs font-bold text-text-muted hover:text-brand-primary transition-colors">
              Already applied? Track your status
            </Link>
          </div>
        </aside>
      </main>
    </div>
  );
}