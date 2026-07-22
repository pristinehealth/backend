"use client";

import Link from "next/link";
import {
    LogIn, ArrowRight, ShieldCheck, MapPin, Building2, Home, Award, CheckCircle2,
    Moon, Sun, Users, Phone, Mail, Stethoscope, Clock, HeartPulse, Sparkles,
    Smartphone, FileCheck, Fingerprint, ClipboardCheck, BadgeCheck, CalendarClock,
    FileSignature, Handshake, Utensils, Car, UserRound, Activity, Eye, ScanLine,
    Bed, Brain, Accessibility, Send, Loader2,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";

/** Fade-and-rise a block into view the first time it scrolls onscreen. */
function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
    const ref = useRef<HTMLDivElement>(null);
    const [shown, setShown] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const io = new IntersectionObserver(
            ([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } },
            { threshold: 0.12 }
        );
        io.observe(el);
        return () => io.disconnect();
    }, []);
    return (
        <div
            ref={ref}
            style={{ transitionDelay: `${delay}ms` }}
            className={`transition-all duration-700 ease-out ${shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"} ${className}`}
        >
            {children}
        </div>
    );
}

/** Small uppercase section eyebrow. */
function Eyebrow({ children, accent = "primary" }: { children: React.ReactNode; accent?: "primary" | "accent" }) {
    return (
        <span className={`text-xs font-black uppercase tracking-[0.2em] ${accent === "primary" ? "text-brand-primary" : "text-brand-accent"}`}>
            {children}
        </span>
    );
}

export default function LandingPage() {
    const [theme, setTheme] = useState<"light" | "dark">("dark");
    const [scrollY, setScrollY] = useState(0);
    const [contact, setContact] = useState({ name: "", email: "", phone: "", inquiryType: "Facility Staffing", message: "", company: "" });
    const [contactStatus, setContactStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
    const [contactError, setContactError] = useState("");
    const renderedAt = useRef(Date.now()); // time-trap: when the page/form loaded

    useEffect(() => {
        setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
        const onScroll = () => setScrollY(window.scrollY);
        window.addEventListener("scroll", onScroll, { passive: true });

        // Load reCAPTCHA v3 (invisible) if configured. No-op without a site key.
        const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
        if (siteKey && !document.getElementById("recaptcha-v3")) {
            const s = document.createElement("script");
            s.id = "recaptcha-v3";
            s.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
            s.async = true;
            s.defer = true;
            document.head.appendChild(s);
        }

        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    // Fetch a fresh reCAPTCHA v3 token at submit time. Returns "" if not configured.
    const getRecaptchaToken = async (): Promise<string> => {
        const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
        const g = (window as unknown as { grecaptcha?: any }).grecaptcha;
        if (!siteKey || !g?.execute) return "";
        try {
            await new Promise<void>((resolve) => g.ready(() => resolve()));
            return await g.execute(siteKey, { action: "contact" });
        } catch {
            return "";
        }
    };

    const toggleTheme = () => {
        const next = theme === "dark" ? "light" : "dark";
        setTheme(next);
        localStorage.theme = next;
        document.documentElement.classList.toggle("dark", next === "dark");
    };

    // Pre-fill the contact form's inquiry type when a CTA funnels here.
    const requestType = (type: string) => setContact((c) => ({ ...c, inquiryType: type }));

    const submitContact = async (e: React.FormEvent) => {
        e.preventDefault();
        setContactStatus("sending");
        setContactError("");
        try {
            const recaptchaToken = await getRecaptchaToken();
            const res = await fetch("/api/contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...contact, renderedAt: renderedAt.current, recaptchaToken }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setContactError(data.error || "Something went wrong. Please try again.");
                setContactStatus("error");
                return;
            }
            setContactStatus("sent");
            setContact({ name: "", email: "", phone: "", inquiryType: "Facility Staffing", message: "", company: "" });
        } catch {
            setContactError("Network error. Please check your connection and try again.");
            setContactStatus("error");
        }
    };

    // ── Section data ──────────────────────────────────────────────────────────
    const facilitySettings = [
        { name: "Assisted Living", icon: Building2 },
        { name: "Long-Term Care", icon: HeartPulse },
        { name: "Memory Care", icon: Brain },
        { name: "Rehabilitation", icon: Activity },
        { name: "Nursing Homes", icon: Stethoscope },
        { name: "Retirement Communities", icon: Home },
        { name: "Adult Family Homes", icon: Users },
    ];
    const professionals = ["CNAs", "HCAs", "LPNs", "RNs", "Medical Assistants", "Medical Technicians", "1:1 Sitters"];
    const coverageModes = ["Short-notice coverage", "Temporary assignments", "Ongoing support", "Day · Evening · Night shifts"];

    const inHomeServices = [
        { name: "Personal Care", icon: HeartPulse },
        { name: "Activities of Daily Living", icon: ClipboardCheck },
        { name: "Companionship", icon: Handshake },
        { name: "Mobility Support", icon: Accessibility },
        { name: "Fall-Risk Monitoring", icon: Eye },
        { name: "Meal Support", icon: Utensils },
        { name: "Respite Care", icon: Bed },
        { name: "Transportation Support", icon: Car },
        { name: "1:1 Care", icon: UserRound },
    ];

    const qualitySteps = [
        { name: "License Verification", icon: BadgeCheck },
        { name: "Certification Review", icon: FileCheck },
        { name: "Background Screening", icon: Fingerprint },
        { name: "Experience Validation", icon: ClipboardCheck },
        { name: "References", icon: Users },
        { name: "Skills Assessment", icon: ScanLine },
        { name: "First Aid / CPR / BLS", icon: HeartPulse },
        { name: "Health Documentation", icon: FileSignature },
        { name: "Ongoing Credential Monitoring", icon: ShieldCheck },
    ];

    const techCapabilities = [
        { name: "Mobile Scheduling", icon: Smartphone },
        { name: "CRM Workflows", icon: ClipboardCheck },
        { name: "EVV Geolocation", icon: MapPin },
        { name: "Electronic Timekeeping", icon: CalendarClock },
        { name: "Client & Facility Sign-Offs", icon: FileSignature },
        { name: "Credential Tracking", icon: BadgeCheck },
        { name: "Compliance Monitoring", icon: ShieldCheck },
        { name: "Electronic Documentation", icon: FileCheck },
    ];

    const STAFFING = "/login?callbackUrl=/dashboard";

    return (
        <div className="min-h-screen bg-background text-foreground font-sans text-base overflow-x-hidden">

            {/* Top contact bar */}
            <div className="bg-zinc-950 text-zinc-300 text-xs py-2 px-4 border-b border-white/5 relative z-50">
                <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-2">
                    <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1"><Phone className="h-3 w-3 text-brand-primary" /> (206) 571-6983</span>
                        <span className="flex items-center gap-1"><Mail className="h-3 w-3 text-brand-primary" /> info@pristinehealthstaffing.com</span>
                    </div>
                    <span className="hidden sm:block">Seattle WA, 98103-4029</span>
                </div>
            </div>

            {/* Nav */}
            <header className="border-b border-sidebar-border bg-sidebar-bg/80 backdrop-blur-xl sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-4 py-3.5 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-2">
                        <img src="/logo.png" alt="Pristine Health" className="h-10 w-auto brightness-110 dark:brightness-100" />
                    </Link>
                    <nav className="hidden md:flex items-center gap-7 text-sm font-semibold">
                        <a href="#workforce" className="hover:text-brand-primary transition-colors">Facility Staffing</a>
                        <a href="#in-home" className="hover:text-brand-primary transition-colors">In-Home Care</a>
                        <a href="#quality" className="hover:text-brand-primary transition-colors">Quality</a>
                        <a href="#technology" className="hover:text-brand-primary transition-colors">Technology</a>
                        <a href="#contact" className="hover:text-brand-primary transition-colors">Contact</a>
                        <Link href="/jobs" className="hover:text-brand-primary transition-colors">Open Positions</Link>
                        <Link href="/jobs/track" className="hover:text-brand-primary transition-colors">Track Application</Link>
                    </nav>
                    <div className="flex items-center gap-3">
                        <button onClick={toggleTheme} className="p-2 rounded-xl text-slate-500 hover:bg-slate-200/50 dark:hover:bg-white/[0.05] transition-all" title="Toggle theme">
                            {theme === "dark" ? <Sun className="h-5 w-5 text-amber-500" /> : <Moon className="h-5 w-5 text-indigo-500" />}
                        </button>
                        <Link href={STAFFING} className="bg-brand-accent hover:bg-brand-accent-dark text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-brand-accent/20 flex items-center gap-1.5 active:scale-95">
                            <LogIn className="h-4 w-4" /> Portal Login
                        </Link>
                    </div>
                </div>
            </header>

            {/* 1 ── HERO ──────────────────────────────────────────────────────── */}
            <section className="relative min-h-[640px] flex items-center overflow-hidden bg-zinc-950">
                {/* Parallax image + scrims */}
                <div
                    className="absolute inset-0 bg-cover bg-center opacity-45 will-change-transform"
                    style={{ backgroundImage: "url('/healthcare_professionals_diversity.png')", transform: `translateY(${scrollY * 0.3}px) scale(1.15)` }}
                />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_40%,rgba(0,0,0,0.25),rgba(9,9,11,0.92))]" />
                <div className="absolute -top-24 right-[12%] w-[28rem] h-[28rem] bg-brand-primary/20 rounded-full blur-[150px] animate-float-slow" />
                <div className="absolute bottom-[-6rem] left-[8%] w-[24rem] h-[24rem] bg-brand-accent/20 rounded-full blur-[150px] animate-float-medium" />

                <div className="relative z-10 max-w-6xl mx-auto px-4 py-20 w-full text-white">
                    <div className="max-w-3xl space-y-6 animate-fade-up">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-primary/90 text-white text-xs font-bold uppercase tracking-wider backdrop-blur">
                            <Award className="h-3.5 w-3.5" /> Staffing Needs Fulfillment
                        </span>
                        <h1 className="text-4xl md:text-6xl font-black leading-[1.05] tracking-tight">
                            Healthcare Talent.<br />
                            <span className="bg-gradient-to-r from-brand-primary via-brand-primary-light to-brand-accent-light bg-clip-text text-transparent">In-Home Care.</span><br />
                            One Trusted Partner.
                        </h1>
                        <p className="text-base md:text-lg text-zinc-300 leading-relaxed max-w-2xl">
                            Pristine Health helps healthcare organizations and individuals access qualified professionals, flexible coverage, and personalized care through a responsive, technology-enabled platform. From urgent staffing needs to ongoing workforce support and in-home care, we make it easier to connect the right people with the right care environment.
                        </p>
                        <p className="text-sm md:text-base font-bold text-brand-primary-light tracking-wide">
                            Better access. Smarter coordination. Reliable support.
                        </p>
                        <div className="flex flex-wrap gap-4 pt-2">
                            <a href="#contact" onClick={() => requestType("Facility Staffing")} className="bg-brand-primary hover:bg-brand-primary-dark text-white font-bold px-7 py-3.5 rounded-xl shadow-lg shadow-brand-primary/30 flex items-center gap-2 active:scale-95 transition-all">
                                Request Staffing <ArrowRight className="h-5 w-5" />
                            </a>
                            <a href="#in-home" className="bg-white/10 hover:bg-white/20 border border-white/25 text-white font-bold px-7 py-3.5 rounded-xl backdrop-blur flex items-center gap-2 active:scale-95 transition-all">
                                <Home className="h-5 w-5" /> Explore In-Home Care
                            </a>
                        </div>
                        <div className="flex flex-wrap gap-x-8 gap-y-3 pt-6 text-sm text-zinc-300">
                            <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-brand-primary" /> Credentialed & compliant</span>
                            <span className="flex items-center gap-2"><Clock className="h-4 w-4 text-brand-primary" /> Short-notice coverage</span>
                            <span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-brand-primary" /> Multi-State</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* 2 ── WORKFORCE SOLUTIONS ───────────────────────────────────────── */}
            <section id="workforce" className="relative max-w-6xl mx-auto px-4 py-24">
                <Reveal className="max-w-2xl space-y-3">
                    <Eyebrow>Workforce Solutions</Eyebrow>
                    <h2 className="text-3xl md:text-4xl font-black text-text-primary tracking-tight">Built for the way healthcare works today</h2>
                    <p className="text-text-secondary leading-relaxed">
                        Staffing needs change quickly. Pristine Health helps organizations stay ready with flexible workforce solutions across a wide range of care settings.
                    </p>
                </Reveal>

                <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4">
                    {facilitySettings.map((s, i) => {
                        const Icon = s.icon;
                        return (
                            <Reveal key={s.name} delay={i * 50}>
                                <div className="crm-panel rounded-2xl p-5 h-full hover:-translate-y-1 hover:border-brand-primary/40 transition-all duration-300 group">
                                    <div className="p-2.5 bg-brand-primary-muted rounded-xl inline-flex border border-brand-primary/10 group-hover:scale-110 transition-transform">
                                        <Icon className="h-5 w-5 text-brand-primary" />
                                    </div>
                                    <h3 className="mt-3 text-sm font-bold text-text-primary">{s.name}</h3>
                                </div>
                            </Reveal>
                        );
                    })}
                </div>

                <Reveal className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6" delay={100}>
                    <div className="ui-card-soft rounded-2xl p-6">
                        <h4 className="text-xs font-black uppercase tracking-wider text-text-primary flex items-center gap-2"><Users className="h-4 w-4 text-brand-accent" /> Professionals we support</h4>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {professionals.map((p) => (
                                <span key={p} className="px-3 py-1.5 rounded-full text-xs font-bold bg-brand-accent-muted text-brand-accent border border-brand-accent/15">{p}</span>
                            ))}
                        </div>
                    </div>
                    <div className="ui-card-soft rounded-2xl p-6">
                        <h4 className="text-xs font-black uppercase tracking-wider text-text-primary flex items-center gap-2"><Clock className="h-4 w-4 text-brand-primary" /> How we cover</h4>
                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {coverageModes.map((c) => (
                                <span key={c} className="flex items-center gap-2 text-sm text-text-secondary"><CheckCircle2 className="h-4 w-4 text-brand-primary shrink-0" /> {c}</span>
                            ))}
                        </div>
                    </div>
                </Reveal>

                <Reveal className="mt-8" delay={150}>
                    <a href="#contact" onClick={() => requestType("Facility Staffing")} className="inline-flex items-center gap-2 bg-brand-primary hover:bg-brand-primary-dark text-white font-bold px-6 py-3 rounded-xl shadow-lg shadow-brand-primary/20 active:scale-95 transition-all">
                        Find Staffing Solutions <ArrowRight className="h-4 w-4" />
                    </a>
                </Reveal>
            </section>

            {/* 3 ── IN-HOME CARE ──────────────────────────────────────────────── */}
            <section id="in-home" className="relative border-y border-sidebar-border bg-slate-100/60 dark:bg-white/[0.015] py-24">
                <div className="max-w-6xl mx-auto px-4">
                    <Reveal className="max-w-2xl space-y-3">
                        <Eyebrow accent="accent">In-Home Care</Eyebrow>
                        <h2 className="text-3xl md:text-4xl font-black text-text-primary tracking-tight">Personalized care. Wherever home is.</h2>
                        <p className="text-text-secondary leading-relaxed">
                            Pristine Health provides individualized support designed around each person's needs, routines, and goals.
                        </p>
                    </Reveal>

                    <div className="mt-10 grid grid-cols-2 md:grid-cols-3 gap-4">
                        {inHomeServices.map((s, i) => {
                            const Icon = s.icon;
                            return (
                                <Reveal key={s.name} delay={i * 40}>
                                    <div className="ui-card rounded-2xl p-5 h-full flex items-center gap-3 hover:border-brand-accent/40 hover:-translate-y-0.5 transition-all duration-300 group">
                                        <div className="p-2.5 bg-brand-accent-muted rounded-xl border border-brand-accent/10 group-hover:scale-110 transition-transform shrink-0">
                                            <Icon className="h-5 w-5 text-brand-accent" />
                                        </div>
                                        <h3 className="text-sm font-bold text-text-primary">{s.name}</h3>
                                    </div>
                                </Reveal>
                            );
                        })}
                    </div>

                    <Reveal className="mt-8 flex flex-col sm:flex-row sm:items-center gap-5 justify-between ui-card-soft rounded-2xl p-6" delay={120}>
                        <p className="text-sm text-text-secondary leading-relaxed max-w-2xl">
                            We also support individuals living in apartments within retirement, assisted living, long-term care, memory care, rehabilitation, and nursing environments.
                        </p>
                        <a href="#contact" onClick={() => requestType("In-Home Care")} className="shrink-0 inline-flex items-center gap-2 bg-brand-accent hover:bg-brand-accent-dark text-white font-bold px-6 py-3 rounded-xl shadow-lg shadow-brand-accent/20 active:scale-95 transition-all">
                            Explore Care Options <ArrowRight className="h-4 w-4" />
                        </a>
                    </Reveal>
                </div>
            </section>

            {/* 4 ── QUALITY AT EVERY STEP ─────────────────────────────────────── */}
            <section id="quality" className="relative max-w-6xl mx-auto px-4 py-24">
                <Reveal className="max-w-2xl space-y-3">
                    <Eyebrow>Quality at Every Step</Eyebrow>
                    <h2 className="text-3xl md:text-4xl font-black text-text-primary tracking-tight">Qualified professionals. Thoughtfully selected.</h2>
                    <p className="text-text-secondary leading-relaxed">
                        We combine human judgment with structured screening and credentialing to identify professionals who are ready to contribute.
                    </p>
                </Reveal>

                <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {qualitySteps.map((s, i) => {
                        const Icon = s.icon;
                        return (
                            <Reveal key={s.name} delay={i * 40}>
                                <div className="crm-panel rounded-2xl p-5 h-full flex items-start gap-3 relative overflow-hidden group hover:border-brand-primary/40 transition-all duration-300">
                                    <div className="absolute top-0 left-0 h-1 w-full bg-brand-primary/20 group-hover:bg-brand-primary transition-colors" />
                                    <div className="p-2.5 bg-brand-primary-muted rounded-xl border border-brand-primary/10 shrink-0">
                                        <Icon className="h-5 w-5 text-brand-primary" />
                                    </div>
                                    <div>
                                        <span className="text-[10px] font-mono font-bold text-text-muted">{String(i + 1).padStart(2, "0")}</span>
                                        <h3 className="text-sm font-bold text-text-primary">{s.name}</h3>
                                    </div>
                                </div>
                            </Reveal>
                        );
                    })}
                </div>

                <Reveal className="mt-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-brand-primary/20 bg-brand-primary-muted p-6" delay={120}>
                    <p className="text-sm md:text-base font-semibold text-text-primary max-w-2xl">
                        The result: professionals selected for the role, the environment, and the people they serve.
                    </p>
                    <Link href="/jobs" className="shrink-0 inline-flex items-center gap-2 bg-brand-primary hover:bg-brand-primary-dark text-white font-bold px-6 py-3 rounded-xl shadow-lg shadow-brand-primary/20 active:scale-95 transition-all">
                        Join the Pristine Network <ArrowRight className="h-4 w-4" />
                    </Link>
                </Reveal>
            </section>

            {/* 5 ── TECHNOLOGY ────────────────────────────────────────────────── */}
            <section id="technology" className="relative overflow-hidden bg-zinc-950 text-white py-24">
                <div className="absolute -top-20 left-1/4 w-[26rem] h-[26rem] bg-brand-accent/15 rounded-full blur-[150px] animate-float-slow" />
                <div className="absolute bottom-[-6rem] right-[10%] w-[22rem] h-[22rem] bg-brand-primary/15 rounded-full blur-[150px] animate-float-medium" />
                <div className="relative z-10 max-w-6xl mx-auto px-4">
                    <Reveal className="max-w-2xl space-y-3">
                        <span className="text-xs font-black uppercase tracking-[0.2em] text-brand-primary-light">Technology That Keeps Care Moving</span>
                        <h2 className="text-3xl md:text-4xl font-black tracking-tight">Connected. Visible. Accountable.</h2>
                        <p className="text-zinc-300 leading-relaxed">
                            Pristine Health uses modern workforce technology to simplify coordination and improve service visibility.
                        </p>
                    </Reveal>

                    <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4">
                        {techCapabilities.map((s, i) => {
                            const Icon = s.icon;
                            return (
                                <Reveal key={s.name} delay={i * 40}>
                                    <div className="rounded-2xl p-5 h-full border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:-translate-y-1 transition-all duration-300 group backdrop-blur">
                                        <div className="p-2.5 rounded-xl inline-flex bg-brand-primary/15 border border-brand-primary/20 group-hover:scale-110 transition-transform">
                                            <Icon className="h-5 w-5 text-brand-primary-light" />
                                        </div>
                                        <h3 className="mt-3 text-sm font-bold text-white">{s.name}</h3>
                                    </div>
                                </Reveal>
                            );
                        })}
                    </div>

                    <Reveal className="mt-8 flex flex-wrap items-center gap-4" delay={120}>
                        <p className="text-sm font-bold text-brand-primary-light">Less friction. Faster communication. Better coordination.</p>
                        <a href="#contact" className="inline-flex items-center gap-2 bg-white text-zinc-900 hover:bg-zinc-100 font-bold px-6 py-3 rounded-xl active:scale-95 transition-all">
                            Talk to Our Team <ArrowRight className="h-4 w-4" />
                        </a>
                    </Reveal>
                </div>
            </section>

            {/* 6 ── FINAL CTA ─────────────────────────────────────────────────── */}
            <section className="relative overflow-hidden bg-gradient-to-br from-brand-accent to-brand-accent-dark text-white py-24 px-4">
                <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_20%_20%,white,transparent_45%)]" />
                <Reveal className="relative z-10 max-w-3xl mx-auto text-center space-y-6">
                    <Sparkles className="h-8 w-8 mx-auto text-brand-primary-light" />
                    <h2 className="text-3xl md:text-5xl font-black tracking-tight">The right people make the difference.</h2>
                    <p className="text-base md:text-lg text-blue-100 leading-relaxed">
                        Whether you are filling an urgent shift, building reliable workforce capacity, or arranging personalized in-home care, Pristine Health helps you move forward with confidence.
                    </p>
                    <div className="flex flex-wrap justify-center gap-4 pt-2">
                        <a href="#contact" onClick={() => requestType("Facility Staffing")} className="bg-brand-primary hover:bg-brand-primary-dark text-white font-bold px-6 py-3.5 rounded-xl shadow-lg shadow-brand-primary/30 flex items-center gap-2 active:scale-95 transition-all">
                            Request Staffing <ArrowRight className="h-4 w-4" />
                        </a>
                        <a href="#contact" onClick={() => requestType("In-Home Care")} className="bg-white text-brand-accent hover:bg-zinc-100 font-bold px-6 py-3.5 rounded-xl flex items-center gap-2 active:scale-95 transition-all">
                            <Home className="h-4 w-4" /> Get In-Home Care
                        </a>
                        <Link href="/jobs" className="bg-white/10 hover:bg-white/20 border border-white/30 text-white font-bold px-6 py-3.5 rounded-xl backdrop-blur flex items-center gap-2 active:scale-95 transition-all">
                            Find Opportunities <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                    <div className="pt-6">
                        <p className="text-lg font-black tracking-tight">Pristine Health</p>
                        <p className="text-xs uppercase tracking-[0.3em] text-blue-200">Staffing Needs Fulfillment</p>
                    </div>
                </Reveal>
            </section>

            {/* ── CONTACT ──────────────────────────────────────────────────── */}
            <section id="contact" className="relative max-w-6xl mx-auto px-4 py-24 scroll-mt-24">
                <Reveal className="max-w-2xl space-y-3">
                    <Eyebrow>Get In Touch</Eyebrow>
                    <h2 className="text-3xl md:text-4xl font-black text-text-primary tracking-tight">Let's talk about your care needs</h2>
                    <p className="text-text-secondary leading-relaxed">
                        Whether you're a facility with a coverage gap or a family arranging in-home care, our team is ready to help. Reach us directly or open the portal.
                    </p>
                </Reveal>

                <div className="mt-10 grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
                    {/* Contact form */}
                    <Reveal className="lg:col-span-3">
                        <form onSubmit={submitContact} className="crm-panel rounded-2xl p-6 md:p-7">
                            {contactStatus === "sent" ? (
                                <div className="text-center py-10 space-y-3">
                                    <div className="mx-auto h-12 w-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                                        <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                                    </div>
                                    <h3 className="text-lg font-black text-text-primary">Message sent</h3>
                                    <p className="text-sm text-text-muted max-w-sm mx-auto">Thanks for reaching out — our team will get back to you within one business day.</p>
                                    <button type="button" onClick={() => setContactStatus("idle")} className="text-xs font-bold text-brand-primary hover:text-brand-primary-dark">
                                        Send another message
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Name</label>
                                            <input required maxLength={120} value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} placeholder="Jane Doe" className="ui-input w-full" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Email</label>
                                            <input type="email" required value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} placeholder="jane@example.com" className="ui-input w-full" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Phone <span className="normal-case font-normal">(optional)</span></label>
                                            <input maxLength={40} value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} placeholder="(206) 555-0100" className="ui-input w-full" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">I'm interested in</label>
                                            <select value={contact.inquiryType} onChange={(e) => setContact({ ...contact, inquiryType: e.target.value })} className="ui-input w-full">
                                                <option>Facility Staffing</option>
                                                <option>In-Home Care</option>
                                                <option>Careers</option>
                                                <option>General</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Message</label>
                                        <textarea required rows={4} maxLength={5000} value={contact.message} onChange={(e) => setContact({ ...contact, message: e.target.value })} placeholder="Tell us about your staffing or care needs…" className="ui-input w-full resize-none" />
                                    </div>
                                    {/* Honeypot — hidden from users, catches bots */}
                                    <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" value={contact.company} onChange={(e) => setContact({ ...contact, company: e.target.value })} className="hidden" />
                                    {contactStatus === "error" && (
                                        <p className="text-xs text-rose-500">{contactError}</p>
                                    )}
                                    <button type="submit" disabled={contactStatus === "sending"} className="inline-flex items-center gap-2 bg-brand-primary hover:bg-brand-primary-dark disabled:opacity-60 text-white font-bold px-6 py-3 rounded-xl shadow-lg shadow-brand-primary/20 active:scale-95 transition-all">
                                        {contactStatus === "sending" ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : <><Send className="h-4 w-4" /> Send Message</>}
                                    </button>
                                </div>
                            )}
                        </form>
                    </Reveal>

                    {/* Direct contact methods */}
                    <Reveal className="lg:col-span-2 space-y-4" delay={100}>
                        <a href="tel:+12065716983" className="crm-panel rounded-2xl p-5 flex items-center gap-3 hover:border-brand-primary/40 transition-colors group">
                            <div className="p-2.5 bg-brand-primary-muted rounded-xl border border-brand-primary/10 group-hover:scale-110 transition-transform shrink-0"><Phone className="h-5 w-5 text-brand-primary" /></div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-wider text-text-muted">Call us</p>
                                <p className="text-sm font-black text-text-primary">(206) 571-6983</p>
                            </div>
                        </a>
                        <a href="mailto:info@pristinehealthstaffing.com" className="crm-panel rounded-2xl p-5 flex items-center gap-3 hover:border-brand-accent/40 transition-colors group">
                            <div className="p-2.5 bg-brand-accent-muted rounded-xl border border-brand-accent/10 group-hover:scale-110 transition-transform shrink-0"><Mail className="h-5 w-5 text-brand-accent" /></div>
                            <div className="min-w-0">
                                <p className="text-[10px] font-black uppercase tracking-wider text-text-muted">Email us</p>
                                <p className="text-sm font-black text-text-primary break-all">info@pristinehealthstaffing.com</p>
                            </div>
                        </a>
                        <div className="crm-panel rounded-2xl p-5 flex items-center gap-3">
                            <div className="p-2.5 bg-brand-primary-muted rounded-xl border border-brand-primary/10 shrink-0"><MapPin className="h-5 w-5 text-brand-primary" /></div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-wider text-text-muted">Visit</p>
                                <p className="text-sm font-black text-text-primary">Seattle, WA · 98103-4029</p>
                            </div>
                        </div>
                    </Reveal>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-zinc-950 text-zinc-400 py-16 px-4 border-t border-white/5 text-sm">
                <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-5 gap-8 pb-12 border-b border-white/5">
                    <div className="col-span-2 space-y-4">
                        <img src="/logo.png" alt="Pristine Health" className="h-12 w-auto brightness-110" />
                        <p className="text-xs text-zinc-500 leading-relaxed max-w-sm">
                            Providing dependable, credentialed, and compliant healthcare staffing and in-home care. Headquartered in Seattle WA, 98103-4029.
                        </p>
                    </div>
                    <div className="space-y-3">
                        <h4 className="text-white font-bold text-sm">Solutions</h4>
                        <ul className="space-y-2 text-xs">
                            <li><a href="#workforce" className="hover:text-white transition-colors">Facility Staffing</a></li>
                            <li><a href="#in-home" className="hover:text-white transition-colors">In-Home Care</a></li>
                            <li><a href="#technology" className="hover:text-white transition-colors">Technology</a></li>
                        </ul>
                    </div>
                    <div className="space-y-3">
                        <h4 className="text-white font-bold text-sm">Careers</h4>
                        <ul className="space-y-2 text-xs">
                            <li><Link href="/jobs" className="hover:text-white transition-colors">Open Positions</Link></li>
                            <li><Link href="/jobs/track" className="hover:text-white transition-colors">Track Application</Link></li>
                            <li><Link href="/login?callbackUrl=/dashboard" className="hover:text-white transition-colors">Portal Login</Link></li>
                        </ul>
                    </div>
                    <div className="space-y-3">
                        <h4 className="text-white font-bold text-sm">Contact</h4>
                        <ul className="space-y-2 text-xs">
                            <li className="flex items-center gap-1.5"><Phone className="h-3 w-3 text-brand-primary" /> (206) 571-6983</li>
                            <li className="flex items-center gap-1.5"><Mail className="h-3 w-3 text-brand-primary" /> info@pristinehealthstaffing.com</li>
                        </ul>
                    </div>
                </div>
                <div className="max-w-6xl mx-auto pt-8 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-zinc-600">
                    <span>&copy; {new Date().getFullYear()} Pristine Health. All Rights Reserved.</span>
                    <div className="flex items-center gap-3">
                        {[
                            { name: "X", href: "https://x.com/pristinehealths", path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" },
                            { name: "YouTube", href: "https://www.youtube.com/@pristinehealthstaffing", path: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" },
                            { name: "LinkedIn", href: "https://www.linkedin.com/company/pristinehealth", path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0z" },
                            { name: "Facebook", href: "https://www.facebook.com/pristinehealthstaffing", path: "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" },
                            { name: "Instagram", href: "https://www.instagram.com/pristinehealthstaffing/", path: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.012-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" },
                        ].map((s) => (
                            <a
                                key={s.name}
                                href={s.href}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={s.name}
                                title={s.name}
                                className="text-zinc-500 hover:text-white transition-colors"
                            >
                                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4.5 w-4.5" aria-hidden="true">
                                    <path d={s.path} />
                                </svg>
                            </a>
                        ))}
                    </div>
                </div>
            </footer>
        </div>
    );
}
