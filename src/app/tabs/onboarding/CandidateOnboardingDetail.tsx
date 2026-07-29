"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, X, Eye, ClipboardList, ShieldCheck, CheckCircle2, ArrowLeft } from "lucide-react";
import { resolveFieldType, toDateInputValue } from "@/lib/formFields";
import { getDocumentLabel, usesMetadataOnlyStorage } from "@/lib/documentMetadata";
import type { DocumentType } from "@/models/ApplicationDocument";

interface PacketItem { _id: string; formName: string; status: string }
interface CustomField { name: string; label: string; type: string; options?: string[] }
interface LoadedQuestionnaire { _id: string; formName: string; status: string; fields: CustomField[]; answers: Record<string, any> }
interface DocRow { documentType: string; deliveryMethod: string; fileName: string; fileUrl: string; value?: string; expiryDate?: string | null; status: string; rejectionReason?: string }
interface RequestedDoc { key: string; label: string }

interface Props {
    applicationId: string;
    applicantName: string;
    jobTitle: string;
    packet: PacketItem[];
    // The compliance documents the onboarding request asked for — the Documents
    // section is scoped to these, so application-time docs aren't shown here.
    requestedDocuments: RequestedDoc[];
    onClose: () => void;
    onViewFile: (url: string, name: string) => void;
}

const STATUS_CLS: Record<string, string> = {
    completed: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    verified: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    in_progress: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    pending: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
    rejected: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
    expired: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
};

type Section =
    | { kind: 'questionnaire'; q: LoadedQuestionnaire; label: string }
    | { kind: 'documents'; label: string };

// Read-only review of a candidate's onboarding submission, laid out like the
// applicant page (section rail + content). Renders inline in the dashboard so the
// left menu stays. Files stream through the admin proxy (never the raw URL).
export function CandidateOnboardingDetail({ applicationId, applicantName, jobTitle, packet, requestedDocuments, onClose, onViewFile }: Props) {
    const [loading, setLoading] = useState(true);
    const [questionnaires, setQuestionnaires] = useState<LoadedQuestionnaire[]>([]);
    const [documents, setDocuments] = useState<DocRow[]>([]);
    const [error, setError] = useState('');
    const [active, setActive] = useState(0);

    useEffect(() => {
        (async () => {
            try {
                const [qResults, docRes] = await Promise.all([
                    Promise.all(packet.map(async (p) => {
                        const res = await fetch(`/api/admin/onboarding/${p._id}`);
                        const data = await res.json();
                        return {
                            _id: p._id,
                            formName: data?.form?.name || p.formName,
                            status: data?.response?.status || p.status,
                            fields: Array.isArray(data?.form?.customFields) ? data.form.customFields : [],
                            answers: data?.response?.answers || {},
                        } as LoadedQuestionnaire;
                    })),
                    fetch(`/api/applications/${applicationId}/documents`).then((r) => r.json()).catch(() => ({ documents: [] })),
                ]);
                setQuestionnaires(qResults);
                setDocuments(Array.isArray(docRes?.documents) ? docRes.documents : []);
            } catch {
                setError('Failed to load submission.');
            } finally {
                setLoading(false);
            }
        })();
    }, [applicationId, packet]);

    // Only the docs the onboarding requested — matched to what was submitted.
    const docByType = useMemo(() => new Map(documents.map((d) => [d.documentType, d])), [documents]);
    const hasDocsSection = requestedDocuments.length > 0;

    const sections: Section[] = useMemo(() => {
        const s: Section[] = questionnaires.map((q) => ({ kind: 'questionnaire' as const, q, label: q.formName }));
        if (hasDocsSection) s.push({ kind: 'documents', label: 'Documents' });
        return s;
    }, [questionnaires, hasDocsSection]);

    const current = sections[Math.min(active, Math.max(0, sections.length - 1))];
    const viewFile = (storedUrl: string, name: string) => onViewFile(`/api/admin/file?src=${encodeURIComponent(storedUrl)}`, name);

    const renderAnswer = (field: CustomField, value: any) => {
        const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
        if (empty) return <span className="text-sm text-text-muted italic">No answer provided</span>;
        const ftype = resolveFieldType(field);
        if (ftype === 'file' && typeof value === 'string') {
            return (
                <button type="button" onClick={() => viewFile(value, field.label)} className="text-sm font-semibold text-brand-primary inline-flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5" /> View file
                </button>
            );
        }
        if (Array.isArray(value)) return <span className="text-sm text-text-primary">{value.join(', ')}</span>;
        if (ftype === 'date') return <span className="text-sm text-text-primary">{toDateInputValue(value) || String(value)}</span>;
        return <span className="text-sm text-text-primary whitespace-pre-wrap">{String(value)}</span>;
    };

    const sectionComplete = (s: Section) => {
        if (s.kind === 'questionnaire') return s.q.status === 'completed';
        return requestedDocuments.every((r) => {
            const d = docByType.get(r.key);
            return d && (d.fileUrl || (d.value && String(d.value).trim()));
        });
    };

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <button onClick={onClose} className="inline-flex items-center gap-1.5 text-xs font-bold text-text-muted hover:text-text-primary mb-2"><ArrowLeft className="h-3.5 w-3.5" /> Back to candidates</button>
                    <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-brand-primary">Onboarding submission</p>
                    <h2 className="text-xl font-black text-text-primary truncate">{applicantName}</h2>
                    <p className="text-xs text-text-secondary">{jobTitle}</p>
                </div>
                <button onClick={onClose} className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold ui-card-soft text-text-secondary hover:text-text-primary px-3 py-2 rounded-xl">
                    <X className="h-4 w-4" /> Close
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-primary" /></div>
            ) : error ? (
                <div className="text-sm text-rose-500">{error}</div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5">
                    {/* Section rail */}
                    <div className="lg:sticky lg:top-4 self-start">
                        <div className="bg-surface-card border border-border-card rounded-2xl p-3 shadow-sm">
                            <ol className="space-y-1">
                                {sections.map((s, i) => {
                                    const isCurrent = i === Math.min(active, sections.length - 1);
                                    const done = sectionComplete(s);
                                    const Icon = s.kind === 'questionnaire' ? ClipboardList : ShieldCheck;
                                    return (
                                        <li key={i}>
                                            <button onClick={() => setActive(i)}
                                                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-bold transition-colors ${isCurrent ? 'bg-brand-primary text-white' : done ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/5' : 'text-text-secondary hover:bg-white/[0.03]'}`}>
                                                {done && !isCurrent ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <Icon className="h-4 w-4 shrink-0" />}
                                                <span className="truncate">{s.label}</span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ol>
                        </div>
                    </div>

                    {/* Active section content */}
                    <div className="bg-surface-card border border-border-card rounded-2xl p-5 sm:p-6 shadow-sm min-h-[320px]">
                        {current?.kind === 'questionnaire' ? (
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className="text-sm font-black uppercase tracking-widest text-brand-primary">{current.q.formName}</h3>
                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold border uppercase ${STATUS_CLS[current.q.status] || STATUS_CLS.in_progress}`}>{current.q.status === 'completed' ? 'Completed' : 'In progress'}</span>
                                </div>
                                {current.q.fields.length === 0 ? (
                                    <p className="text-sm text-text-muted">No questions.</p>
                                ) : (
                                    <div className="rounded-xl border border-border-card divide-y divide-border-card overflow-hidden">
                                        {current.q.fields.map((field) => (
                                            <div key={field.name} className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-1 sm:gap-3 px-4 py-3">
                                                <span className="text-xs font-bold text-text-secondary">{field.label}</span>
                                                <div>{renderAnswer(field, current.q.answers[field.name])}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : current?.kind === 'documents' ? (
                            <div className="space-y-4">
                                <h3 className="text-sm font-black uppercase tracking-widest text-brand-primary">Documents</h3>
                                <div className="space-y-2">
                                    {requestedDocuments.map((r) => {
                                        const doc = docByType.get(r.key);
                                        const isMeta = usesMetadataOnlyStorage(r.key as DocumentType);
                                        return (
                                            <div key={r.key} className="border border-border-card rounded-xl p-4 flex items-center justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-sm font-bold text-text-primary">{r.label || getDocumentLabel(r.key as DocumentType)}</span>
                                                        {doc && <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold border uppercase ${STATUS_CLS[doc.status] || STATUS_CLS.pending}`}>{doc.status}</span>}
                                                    </div>
                                                    {doc?.expiryDate && <p className="text-[10px] text-text-muted mt-0.5">Expires {new Date(doc.expiryDate).toLocaleDateString()}</p>}
                                                    {doc?.status === 'rejected' && doc.rejectionReason && <p className="text-[10px] text-rose-500 mt-0.5">Reason: {doc.rejectionReason}</p>}
                                                </div>
                                                {doc?.fileUrl ? (
                                                    <button type="button" onClick={() => viewFile(doc.fileUrl, doc.fileName || (r.label || getDocumentLabel(r.key as DocumentType)))} className="shrink-0 text-sm font-semibold text-brand-primary inline-flex items-center gap-1.5"><Eye className="h-3.5 w-3.5" /> View</button>
                                                ) : isMeta && doc?.value ? (
                                                    <span className="shrink-0 text-sm font-bold text-text-primary">{doc.value}</span>
                                                ) : (
                                                    <span className="shrink-0 text-xs text-text-muted italic">Not provided</span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            )}
        </div>
    );
}
