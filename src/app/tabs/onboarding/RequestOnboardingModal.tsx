"use client";

import { useEffect, useState } from "react";
import { Loader2, X, Copy, Check, RotateCcw, Ban, Send, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface FormOption { _id: string; name: string; customFields?: unknown[] }
interface RequirementOption { key: string; label: string; evidenceMode?: string }
interface InviteState { status: string; expiresAt?: string; onboardingFormIds?: string[]; requestedDocumentKeys?: string[] }

interface Props {
    applicationId: string;
    applicantName: string;
    forms: FormOption[];
    onClose: () => void;
    onChanged?: () => void;
}

// Admin action: request an accepted applicant to self-serve onboarding —
// choose questionnaires + compliance documents, generate/copy an expiring link,
// and revoke/regenerate it.
export function RequestOnboardingModal({ applicationId, applicantName, forms, onClose, onChanged }: Props) {
    const [requirements, setRequirements] = useState<RequirementOption[]>([]);
    const [formIds, setFormIds] = useState<string[]>([]);
    const [docKeys, setDocKeys] = useState<string[]>([]);
    const [invite, setInvite] = useState<InviteState | null>(null);
    const [link, setLink] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<'send' | 'revoke' | 'regenerate' | 'cancel' | null>(null);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);
    const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const [reqRes, invRes] = await Promise.all([
                    fetch('/api/admin/compliance/requirements'),
                    fetch(`/api/admin/onboarding/invite/${applicationId}`),
                ]);
                const reqData = await reqRes.json();
                const active = (Array.isArray(reqData?.requirements) ? reqData.requirements : [])
                    .filter((r: any) => r.active !== false);
                setRequirements(active.map((r: any) => ({ key: r.key, label: r.label, evidenceMode: r.evidenceMode })));
                const invData = await invRes.json();
                if (invData?.invite) {
                    setInvite(invData.invite);
                    setFormIds(invData.invite.onboardingFormIds?.map(String) || []);
                    setDocKeys(invData.invite.requestedDocumentKeys || []);
                }
            } catch {
                setError('Failed to load options.');
            } finally {
                setLoading(false);
            }
        })();
    }, [applicationId]);

    const toggle = (arr: string[], set: (v: string[]) => void, v: string) =>
        set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

    const send = async () => {
        if (formIds.length === 0 && docKeys.length === 0) { setError('Select at least one questionnaire or document.'); return; }
        setBusy('send'); setError('');
        try {
            const res = await fetch('/api/admin/onboarding/invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ applicationId, onboardingFormIds: formIds, requestedDocumentKeys: docKeys }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data?.error || 'Failed to send request.'); return; }
            setInvite(data.invite);
            setLink(data.onboardingUrl || '');
            onChanged?.();
        } finally {
            setBusy(null);
        }
    };

    const act = async (action: 'revoke' | 'regenerate' | 'cancel') => {
        setBusy(action as any); setError('');
        try {
            const res = await fetch(`/api/admin/onboarding/invite/${applicationId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data?.error || 'Action failed.'); return; }
            setInvite(data.invite);
            if (data.onboardingUrl) setLink(data.onboardingUrl);
            if (action === 'revoke' || action === 'cancel') setLink('');
            if (action === 'cancel') { setFormIds([]); setDocKeys([]); setConfirmCancelOpen(false); }
            onChanged?.();
        } finally {
            setBusy(null);
        }
    };

    const copy = async () => {
        if (!link) return;
        try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
    };

    // Whether the server currently holds an actual request (something to
    // revoke/regenerate/cancel). A cancelled invite has empty arrays.
    const hasRequest = !!invite && (((invite.onboardingFormIds?.length || 0) > 0) || ((invite.requestedDocumentKeys?.length || 0) > 0));

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-surface-modal border border-border-modal rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border-modal">
                    <div>
                        <h3 className="font-black text-text-primary">Request onboarding</h3>
                        <p className="text-[11px] text-text-muted">{applicantName}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg text-text-secondary hover:bg-white/[0.06]"><X className="h-4 w-4" /></button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-5">
                    {loading ? (
                        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-brand-primary" /></div>
                    ) : (
                        <>
                            {invite && hasRequest ? (
                                <div className={`rounded-xl border px-3 py-2 text-xs font-bold ${invite.status === 'active' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : invite.status === 'revoked' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' : 'ui-card-soft text-text-secondary border-border-card'}`}>
                                    Link status: {invite.status.toUpperCase()}{invite.expiresAt ? ` · expires ${new Date(invite.expiresAt).toLocaleDateString()}` : ''}
                                </div>
                            ) : null}

                            <div className="space-y-2">
                                <p className="text-[10px] font-black uppercase tracking-wider text-text-muted">Questionnaires for the applicant to fill</p>
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

                            {link && (
                                <div className="space-y-1.5">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-text-muted">Secure link (emailed to the applicant)</p>
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

                <div className="shrink-0 flex items-center justify-between gap-2 px-6 py-4 border-t border-border-modal bg-surface-modal">
                    <div className="flex gap-2">
                        {invite && invite.status === 'active' && hasRequest && (
                            <button onClick={() => act('revoke')} disabled={busy !== null} title="Disable the link but keep what was requested (you can regenerate later)" className="px-3 py-2 rounded-xl text-xs font-bold border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 disabled:opacity-60 inline-flex items-center gap-1.5">
                                {busy === 'revoke' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />} Revoke
                            </button>
                        )}
                        {invite && invite.status !== 'active' && hasRequest && (
                            <button onClick={() => act('regenerate')} disabled={busy !== null} className="px-3 py-2 rounded-xl text-xs font-bold border border-brand-primary/30 text-brand-primary hover:bg-brand-primary/10 disabled:opacity-60 inline-flex items-center gap-1.5">
                                {busy === 'regenerate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Regenerate
                            </button>
                        )}
                        {hasRequest && (
                            <button onClick={() => setConfirmCancelOpen(true)} disabled={busy !== null} title="Disable the link AND clear everything requested" className="px-3 py-2 rounded-xl text-xs font-bold text-text-muted hover:text-rose-500 disabled:opacity-60 inline-flex items-center gap-1.5">
                                {busy === 'cancel' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Cancel request
                            </button>
                        )}
                    </div>
                    <button onClick={send} disabled={busy !== null || loading} className="px-5 py-2 rounded-xl text-xs font-bold bg-brand-primary text-white hover:bg-brand-primary-dark disabled:opacity-60 inline-flex items-center gap-1.5">
                        {busy === 'send' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {invite ? 'Update & resend' : 'Send request'}
                    </button>
                </div>
            </div>

            <ConfirmDialog
                open={confirmCancelOpen}
                tone="danger"
                title="Cancel this request?"
                message="The link will be disabled and all requested questionnaires and documents will be removed. Anything the applicant already submitted is kept."
                confirmLabel="Cancel request"
                cancelLabel="Keep request"
                busy={busy === 'cancel'}
                onConfirm={() => act('cancel')}
                onClose={() => setConfirmCancelOpen(false)}
            />
        </div>
    );
}
