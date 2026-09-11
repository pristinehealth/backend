"use client";

import { useEffect, useRef, useState } from "react";

// Declarative intake field. `core` maps a field onto the /api/contact top-level
// fields (name/email/phone); everything else is composed into the message body.
export type IntakeField =
    | { name: string; label: string; type: "text" | "email" | "tel"; required?: boolean; placeholder?: string; core?: "name" | "email" | "phone" }
    | { name: string; label: string; type: "select"; required?: boolean; options: string[] }
    | { name: string; label: string; type: "checkboxes"; options: string[] }
    | { name: string; label: string; type: "textarea"; required?: boolean; placeholder?: string };

type Values = Record<string, string | string[]>;

async function getRecaptchaToken(): Promise<string | undefined> {
    const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
    const g = (window as unknown as { grecaptcha?: any }).grecaptcha;
    if (!siteKey || !g) return undefined;
    try {
        return await new Promise<string>((resolve) => g.ready(() => g.execute(siteKey, { action: "intake" }).then(resolve)));
    } catch {
        return undefined;
    }
}

export function IntakeForm({
    fields,
    inquiryType,
    submitLabel = "Send request",
    successMessage = "Thanks — we’ve received your request and will be in touch shortly.",
}: {
    fields: IntakeField[];
    inquiryType: string;
    submitLabel?: string;
    successMessage?: string;
}) {
    const [values, setValues] = useState<Values>({});
    const [company, setCompany] = useState(""); // honeypot
    const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
    const [error, setError] = useState("");
    const renderedAt = useRef(Date.now());

    // Load reCAPTCHA v3 once (no-op if not configured).
    useEffect(() => {
        const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
        if (!siteKey || document.getElementById("recaptcha-v3")) return;
        const s = document.createElement("script");
        s.id = "recaptcha-v3";
        s.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
        document.head.appendChild(s);
    }, []);

    const set = (name: string, v: string | string[]) => setValues((prev) => ({ ...prev, [name]: v }));
    const toggle = (name: string, opt: string) =>
        setValues((prev) => {
            const cur = Array.isArray(prev[name]) ? (prev[name] as string[]) : [];
            return { ...prev, [name]: cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt] };
        });

    function buildPayload() {
        let name = "", email = "", phone = "";
        const lines: string[] = [];
        for (const f of fields) {
            const raw = values[f.name];
            if ("core" in f && f.core) {
                const v = typeof raw === "string" ? raw.trim() : "";
                if (f.core === "name") name = v;
                else if (f.core === "email") email = v;
                else phone = v;
                continue;
            }
            const v = Array.isArray(raw) ? raw.join(", ") : (raw || "").toString().trim();
            if (v) lines.push(`${f.label}: ${v}`);
        }
        const message = lines.join("\n");
        return { name, email, phone, message };
    }

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setStatus("sending");
        setError("");
        const { name, email, phone, message } = buildPayload();
        if (!name || !email) {
            setStatus("error");
            setError("Please provide your name and email.");
            return;
        }
        try {
            const recaptchaToken = await getRecaptchaToken();
            const res = await fetch("/api/contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    email,
                    phone,
                    inquiryType,
                    message: message || inquiryType,
                    company,
                    renderedAt: renderedAt.current,
                    recaptchaToken,
                }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || "Something went wrong.");
            }
            setStatus("sent");
        } catch (err: any) {
            setStatus("error");
            setError(err?.message || "Could not send your request. Please try again or email us directly.");
        }
    }

    if (status === "sent") {
        return (
            <div className="rounded-2xl border border-brand-primary/20 bg-brand-primary-muted p-8 text-center">
                <div className="text-3xl">✅</div>
                <p className="mt-3 text-lg font-bold text-text-primary">{successMessage}</p>
            </div>
        );
    }

    return (
        <form onSubmit={onSubmit} className="space-y-5">
            {fields.map((f) => (
                <div key={f.name}>
                    <label htmlFor={f.name} className="block text-sm font-bold text-text-primary mb-1.5">
                        {f.label}
                        {"required" in f && f.required && <span className="text-brand-primary"> *</span>}
                    </label>
                    {f.type === "textarea" ? (
                        <textarea id={f.name} rows={4} placeholder={f.placeholder}
                            value={(values[f.name] as string) || ""} onChange={(e) => set(f.name, e.target.value)}
                            className="ui-input w-full" />
                    ) : f.type === "select" ? (
                        <select id={f.name} value={(values[f.name] as string) || ""} onChange={(e) => set(f.name, e.target.value)} className="ui-input w-full">
                            <option value="">Select…</option>
                            {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                    ) : f.type === "checkboxes" ? (
                        <div className="flex flex-wrap gap-2">
                            {f.options.map((o) => {
                                const on = Array.isArray(values[f.name]) && (values[f.name] as string[]).includes(o);
                                return (
                                    <button type="button" key={o} onClick={() => toggle(f.name, o)}
                                        className={`px-3.5 py-2 rounded-xl text-sm font-semibold border transition-colors ${on ? "bg-brand-primary text-white border-brand-primary" : "bg-surface-card text-text-secondary border-border-card hover:border-brand-primary/50"}`}>
                                        {o}
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <input id={f.name} type={f.type} placeholder={f.placeholder} required={"required" in f && f.required}
                            value={(values[f.name] as string) || ""} onChange={(e) => set(f.name, e.target.value)}
                            className="ui-input w-full" />
                    )}
                </div>
            ))}

            {/* Honeypot — hidden from users, bots fill it. */}
            <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" value={company} onChange={(e) => setCompany(e.target.value)} className="hidden" />

            {error && <p className="text-sm font-semibold text-red-500">{error}</p>}

            <button type="submit" disabled={status === "sending"}
                className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 rounded-xl text-sm font-bold bg-brand-primary text-white hover:bg-brand-primary-dark disabled:opacity-60 transition-colors">
                {status === "sending" ? "Sending…" : submitLabel}
            </button>
            <p className="text-xs text-text-muted">We’ll only use your details to respond to your request.</p>
        </form>
    );
}
