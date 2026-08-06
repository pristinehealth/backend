"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, X, Copy, Check, Send, Search, UserCheck } from "lucide-react";

interface FormOption { _id: string; name: string; customFields?: unknown[] }
interface RequirementOption { key: string; label: string; evidenceMode?: string }
interface StaffOption { staffid: string; full_name?: string; firstname?: string; lastname?: string; email?: string }

interface Props {
    forms: FormOption[];
    onClose: () => void;
    onChanged?: () => void;
}

const staffLabel = (s: StaffOption) =>
    (s.full_name || [s.firstname, s.lastname].filter(Boolean).join(' ').trim() || s.staffid);

// Admin action (Phase 3): onboard an EXISTING staff member who has no
// application — pick the staff member, confirm/collect an email, choose
// questionnaires + compliance documents, and generate an expiring link.
export function StaffOnboardingModal({ forms, onClose, onChanged }: Props) {
    const [staff, setStaff] = useState<StaffOption[]>([]);
    const [requirements, setRequirements] = useState<RequirementOption[]>([]);
    const [loading, setLoading] = useState(true);

    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<StaffOption | null>(null);
    const [email, setEmail] = useState('');
    const [formIds, setFormIds] = useState<string[]>([]);
    const [docKeys, setDocKeys] = useState<string[]>([]);

    const [link, setLink] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const [staffRes, reqRes] = await Promise.all([
                    fetch('/api/staff'),
                    fetch('/api/admin/compliance/requirements'),
                ]);
                const staffData = await staffRes.json();
                setStaff(Array.isArray(staffData) ? staffData : []);
                const reqData = await reqRes.json();
                const active = (Array.isArray(reqData?.requirements) ? reqData.requirements : []).filter((r: any) => r.active !== false);
                setRequirements(active.map((r: any) => ({ key: r.key, label: r.label, evidenceMode: r.evidenceMode })));
            } catch {
                setError('Failed to load staff or requirements.');
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return staff.slice(0, 30);
        return staff.filter((s) =>
            staffLabel(s).toLowerCase().includes(q) ||
            String(s.staffid).toLowerCase().includes(q) ||
            (s.email || '').toLowerCase().includes(q)
        ).slice(0, 30);
    }, [staff, query]);

    const pick = (s: StaffOption) => {
        setSelected(s);
        setEmail(s.email || '');
        setLink('');
        setError('');
    };

    const toggle = (arr: string[], set: (v: string[]) => void, v: string) =>
        set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

    const generate = async () => {
        if (!selected) { setError('Select a staff member first.'); return; }
        if (!email.trim()) { setError('An email is required to send the onboarding link.'); return; }
        if (formIds.length === 0 && docKeys.length === 0) { setError('Select at least one questionnaire or document.'); return; }
        setBusy(true); setError('');
        try {
            const res = await fetch('/api/admin/onboarding/staff-invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ staffId: selected.staffid, email: email.trim(), onboardingFormIds: formIds, requestedDocumentKeys: docKeys }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data?.error || 'Failed to generate the onboarding link.'); return; }
            setLink(data.onboardingUrl || '');
            onChanged?.();
        } finally {
            setBusy(false);
        }
    };

    const copy = async () => {
        if (!link) return;
        try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-surface-modal border border-border-modal rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border-modal">
                    <div>
                        <h3 className="font-black text-text-primary">Onboard existing staff</h3>
                        <p className="text-[11px] text-text-muted">Generate an onboarding link for a staff member without an application</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg text-text-secondary hover:bg-white/[0.06]"><X className="h-4 w-4" /></button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-5">
                    {loading ? (
                        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-brand-primary" /></div>
                    ) : (
                        <>
                            {/* Staff picker */}
                            <div className="space-y-2">
                                <p className="text-[10px] font-black uppercase tracking-wider text-text-muted">Staff member</p>
                                {selected ? (
                                    <div className="flex items-center gap-2.5 p-2.5 rounded-xl border border-brand-primary bg-brand-primary-muted">
                                        <UserCheck className="h-4 w-4 text-brand-primary" />
                                        <span className="text-sm font-bold text-text-primary">{staffLabel(selected)}</span>
                                        <span className="text-[11px] text-text-muted">#{selected.staffid}</span>
                                        <button onClick={() => { setSelected(null); setLink(''); }} className="ml-auto text-[11px] font-bold text-brand-primary">Change</button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-2 ui-input">
                                            <Search className="h-4 w-4 text-text-muted" />
                                            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, ID, or email" className="flex-1 bg-transparent outline-none text-sm" />
                                        </div>
                                        <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                                            {filtered.length === 0 ? <p className="text-xs text-text-muted px-1">No staff match.</p> : filtered.map((s) => (
                                                <button key={s.staffid} onClick={() => pick(s)} className="w-full flex items-center gap-2.5 p-2.5 rounded-xl border border-border-card hover:border-brand-primary/40 text-left">
                                                    <span className="text-sm font-bold text-text-primary">{staffLabel(s)}</span>
                                                    <span className="text-[11px] text-text-muted">#{s.staffid}</span>
                                                    {s.email ? <span className="ml-auto text-[11px] text-text-muted truncate max-w-[150px]">{s.email}</span> : <span className="ml-auto text-[10px] font-bold text-amber-500">no email</span>}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>

                            {selected && (
                                <>
                                    {/* Email (required for the link) */}
                                    <div className="space-y-1.5">
                                        <p className="text-[10px] font-black uppercase tracking-wider text-text-muted">Email for the secure link</p>
                                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className="ui-input w-full text-sm" />
                                        {!selected.email && <p className="text-[11px] text-amber-500">This staff member has no email on file — enter one to send the link.</p>}
                                    </div>

                                    <div className="space-y-2">
                                        <p className="text-[10px] font-black uppercase tracking-wider text-text-muted">Questionnaires for the staff member to fill</p>
                                        {forms.length === 0 ? <p className="text-xs text-text-muted">No questionnaires yet.</p> : forms.map((f) => (
                                            <label key={f._id} className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer ${formIds.includes(f._id) ? 'border-brand-primary bg-brand-primary-muted' : 'border-border-card hover:border-brand-primary/40'}`}>
                                                <input type="checkbox" checked={formIds.includes(f._id)} onChange={() => toggle(formIds, setFormIds, f._id)} className="h-4 w-4 rounded" />
                                                <span className="text-sm font-bold text-text-primary">{f.name}</span>
                                            </label>
                                        ))}
                                    </div>

                                    <div className="space-y-2">
                                        <p className="text-[10px] font-black uppercase tracking-wider text-text-muted">Compliance documents to request</p>
                                        <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                                            {requirements.map((r) => (
                                                <label key={r.key} className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer ${docKeys.includes(r.key) ? 'border-brand-primary bg-brand-primary-muted' : 'border-border-card hover:border-brand-primary/40'}`}>
                                                    <input type="checkbox" checked={docKeys.includes(r.key)} onChange={() => toggle(docKeys, setDocKeys, r.key)} className="h-4 w-4 rounded" />
                                                    <span className="text-sm text-text-primary">{r.label}</span>
                                                    <span className="ml-auto text-[9px] font-bold uppercase text-text-muted">{r.evidenceMode === 'metadata_only' ? 'Value' : 'File'}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}

                            {link && (
                                <div className="space-y-1.5">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-text-muted">Secure link (emailed to the staff member)</p>
                                    <div className="flex items-center gap-2">
                                        <input readOnly value={link} className="ui-input flex-1 text-xs" />
                                        <button onClick={copy} className="px-3 py-2 rounded-xl text-xs font-bold ui-card-soft text-text-secondary inline-flex items-center gap-1">{copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}</button>
                                    </div>
                                </div>
                            )}

                            {error && <p className="text-xs text-rose-500">{error}</p>}
                        </>
                    )}
                </div>

                <div className="shrink-0 flex items-center justify-end gap-2 px-6 py-4 border-t border-border-modal bg-surface-modal">
                    <button onClick={generate} disabled={busy || loading || !selected} className="px-5 py-2 rounded-xl text-xs font-bold bg-brand-primary text-white hover:bg-brand-primary-dark disabled:opacity-60 inline-flex items-center gap-1.5">
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {link ? 'Update & resend' : 'Generate link'}
                    </button>
                </div>
            </div>
        </div>
    );
}
