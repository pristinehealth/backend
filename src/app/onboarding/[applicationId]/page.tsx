"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
    Loader2, Upload, Eye, CheckCircle2, AlertCircle, Lock, Download, FileText,
    ArrowLeft, ClipboardList, ShieldCheck, PartyPopper,
} from "lucide-react";
import { PublicHeader } from "@/components/PublicHeader";
import { resolveFieldType, toDateInputValue } from "@/lib/formFields";
import { requiresFileUpload, sanitizeMetadataValue, metadataInputProps, getDocumentLabel } from "@/lib/documentMetadata";
import type { DocumentType } from "@/models/ApplicationDocument";

type FieldType = 'text' | 'paragraph' | 'number' | 'select' | 'checkbox' | 'file' | 'date';
interface CustomField { name: string; label: string; type: FieldType; required: boolean; options?: string[]; section?: string; }
interface Questionnaire { responseId: string; formName: string; status: string; fields: CustomField[]; answers: Record<string, any>; }
interface Requirement { documentType: string; label: string; required: boolean; requiresFile: boolean; storageMode: 'file' | 'metadata_only'; requiresExpiry: boolean; }
interface DocRow { _id: string; documentType: string; fileUrl: string; fileName: string; value?: string; status: string; }
interface Resource { _id: string; title: string; description: string; category: string; fileName: string; downloadRef: string; }

interface Payload {
    valid: boolean;
    reason?: 'missing' | 'revoked' | 'expired';
    applicantName?: string;
    jobTitle?: string;
    expiresAt?: string;
    questionnaires?: Questionnaire[];
    requirements?: Requirement[];
    documents?: DocRow[];
}

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED = ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.txt'];

// A wizard step is either a questionnaire, the documents collection, or review.
type Step =
    | { kind: 'questionnaire'; q: Questionnaire; label: string }
    | { kind: 'documents'; label: string }
    | { kind: 'review'; label: string };

export default function OnboardingPage() {
    const params = useParams();
    const search = useSearchParams();
    const applicationId = String(params?.applicationId || '');
    const email = search.get('email') || '';
    const token = search.get('token') || '';

    const [clientSessionId, setClientSessionId] = useState('');
    const [loading, setLoading] = useState(true);
    const [payload, setPayload] = useState<Payload | null>(null);
    const [pageError, setPageError] = useState('');
    const [saving, setSaving] = useState<'save' | 'submit' | null>(null);
    const [message, setMessage] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [resources, setResources] = useState<Resource[]>([]);
    const [stepIndex, setStepIndex] = useState(0);

    const [answers, setAnswers] = useState<Record<string, Record<string, any>>>({});
    const [answerFileNames, setAnswerFileNames] = useState<Record<string, Record<string, string>>>({});
    const [docUploads, setDocUploads] = useState<Record<string, { publicId?: string; fileRef?: string; fileName?: string; value?: string }>>({});
    const [uploadedPublicIds, setUploadedPublicIds] = useState<string[]>([]);
    const [busyKey, setBusyKey] = useState<string>('');
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    useEffect(() => { setClientSessionId(crypto.randomUUID()); }, []);
    const cred = useMemo(() => new URLSearchParams({ email, accessToken: token }).toString(), [email, token]);

    const load = async () => {
        setLoading(true); setPageError('');
        try {
            const res = await fetch(`/api/onboarding/track/${applicationId}?${cred}`);
            const data: Payload = await res.json();
            if (!res.ok) { setPageError((data as any)?.error || 'Unable to load your onboarding.'); setLoading(false); return; }
            setPayload(data);
            if (data.valid) {
                const seededAnswers: Record<string, Record<string, any>> = {};
                for (const q of data.questionnaires || []) seededAnswers[q.responseId] = { ...q.answers };
                setAnswers(seededAnswers);
                const seededDocs: Record<string, any> = {};
                for (const d of data.documents || []) {
                    seededDocs[d.documentType] = d.fileUrl ? { fileRef: d.fileUrl, fileName: d.fileName } : { value: d.value || '' };
                }
                setDocUploads(seededDocs);
                try {
                    const rr = await fetch(`/api/onboarding/resources?${cred}`);
                    const rd = await rr.json();
                    if (rr.ok) setResources(Array.isArray(rd.resources) ? rd.resources : []);
                } catch { /* ignore */ }
            }
        } catch {
            setPageError('Unable to load your onboarding.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (applicationId && email && token) load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [applicationId, email, token]);

    // ── Steps ────────────────────────────────────────────────────────────────
    const questionnaires = payload?.questionnaires || [];
    const requirements = payload?.requirements || [];

    const steps: Step[] = useMemo(() => {
        const s: Step[] = questionnaires.map((q) => ({ kind: 'questionnaire' as const, q, label: q.formName }));
        if (requirements.length > 0) s.push({ kind: 'documents', label: 'Documents' });
        s.push({ kind: 'review', label: 'Review & submit' });
        return s;
    }, [questionnaires, requirements]);

    const isFieldFilled = (field: CustomField, val: any) => {
        if (field.type === 'checkbox') return Array.isArray(val) && val.length > 0;
        return val !== undefined && val !== null && String(val).trim() !== '';
    };
    const questionnaireComplete = (q: Questionnaire) =>
        q.fields.filter((f) => f.required).every((f) => isFieldFilled(f, answers[q.responseId]?.[f.name]));
    const docProvided = (r: Requirement) => {
        const u = docUploads[r.documentType] || {};
        return r.requiresFile ? !!(u.publicId || u.fileRef) : !!(u.value && u.value.trim());
    };
    const documentsComplete = requirements.filter((r) => r.required).every(docProvided);

    const stepComplete = (step: Step) => {
        if (step.kind === 'questionnaire') return questionnaireComplete(step.q);
        if (step.kind === 'documents') return documentsComplete;
        return questionnaires.every(questionnaireComplete) && documentsComplete;
    };
    const completedCount = steps.filter((s) => s.kind !== 'review' && stepComplete(s)).length;
    const totalTrackable = Math.max(1, steps.filter((s) => s.kind !== 'review').length);
    const safeStep = Math.max(0, Math.min(stepIndex, steps.length - 1));
    const current = steps[safeStep];

    // ── Upload + answer handlers ─────────────────────────────────────────────
    const uploadFile = async (file: File, extra: Record<string, string>): Promise<{ public_id: string } | null> => {
        if (file.size > MAX_SIZE) throw new Error('File exceeds 10MB limit.');
        if (!ALLOWED.some((e) => file.name.toLowerCase().endsWith(e))) throw new Error('Invalid format. Use PDF, Word, image, or text.');
        const fd = new FormData();
        fd.append('file', file); fd.append('source', 'onboarding');
        fd.append('usageType', extra.usageType || 'supporting_document'); fd.append('clientSessionId', clientSessionId);
        Object.entries(extra).forEach(([k, v]) => { if (k !== 'usageType') fd.append(k, v); });
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Upload failed.');
        setUploadedPublicIds((prev) => [...prev, data.public_id]);
        return { public_id: data.public_id };
    };
    const previewNew = (publicId: string) => window.open(`/api/upload/preview?publicId=${encodeURIComponent(publicId)}&clientSessionId=${encodeURIComponent(clientSessionId)}`, '_blank');
    const previewExisting = (ref: string) => window.open(ref, '_blank');

    const setAnswer = (rid: string, name: string, value: any) => setAnswers((prev) => ({ ...prev, [rid]: { ...prev[rid], [name]: value } }));
    const onAnswerFile = async (rid: string, field: CustomField, file: File | null) => {
        if (!file) return;
        const k = `${rid}:${field.name}`; setFieldErrors((p) => ({ ...p, [k]: '' })); setBusyKey(k);
        try {
            const up = await uploadFile(file, { usageType: 'custom_field', fieldKey: field.name });
            if (up) { setAnswer(rid, field.name, up.public_id); setAnswerFileNames((p) => ({ ...p, [rid]: { ...p[rid], [field.name]: file.name } })); }
        } catch (e: any) { setFieldErrors((p) => ({ ...p, [k]: e?.message || 'Upload failed.' })); } finally { setBusyKey(''); }
    };
    const onDocFile = async (documentType: string, file: File | null) => {
        if (!file) return;
        setFieldErrors((p) => ({ ...p, [documentType]: '' })); setBusyKey(documentType);
        try {
            const up = await uploadFile(file, { usageType: 'supporting_document', documentType });
            if (up) setDocUploads((prev) => ({ ...prev, [documentType]: { publicId: up.public_id, fileName: file.name } }));
        } catch (e: any) { setFieldErrors((p) => ({ ...p, [documentType]: e?.message || 'Upload failed.' })); } finally { setBusyKey(''); }
    };
    const onDocValue = (documentType: string, raw: string) =>
        setDocUploads((prev) => ({ ...prev, [documentType]: { ...prev[documentType], value: sanitizeMetadataValue(documentType as DocumentType, raw) } }));
    const docIsFile = (r: Requirement) => (typeof r.requiresFile === 'boolean' ? r.requiresFile : requiresFileUpload(r.documentType as DocumentType));

    const persist = async (submit: boolean) => {
        setSaving(submit ? 'submit' : 'save'); setPageError(''); setMessage('');
        try {
            const responses = questionnaires.map((q) => ({ responseId: q.responseId, answers: answers[q.responseId] || {} }));
            const documents = requirements.map((r) => {
                const u = docUploads[r.documentType] || {};
                return { documentType: r.documentType, publicId: u.publicId || '', fileUrl: u.publicId ? '' : (u.fileRef || ''), fileName: u.fileName || '', value: u.value || '' };
            });
            const res = await fetch(`/api/onboarding/track/${applicationId}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, accessToken: token, responses, documents, uploadedPublicIds, submit }),
            });
            const data = await res.json();
            if (!res.ok) { setPageError(data?.error || 'Unable to save.'); return; }
            setUploadedPublicIds([]);
            if (submit) { setSubmitted(true); return; }
            setMessage('Progress saved.');
            await load();
        } catch { setPageError('Unable to save.'); } finally { setSaving(null); }
    };

    // ── Render states ────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="min-h-screen bg-background text-foreground flex flex-col">
                <PublicHeader label="Onboarding" showLogin={false} />
                <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-brand-primary" /></div>
            </div>
        );
    }
    if (payload && !payload.valid) {
        const reasonText = payload.reason === 'revoked' ? 'This onboarding link has been revoked.'
            : payload.reason === 'expired' ? 'This onboarding link has expired.' : 'This onboarding link is not valid.';
        return (
            <div className="min-h-screen bg-background text-foreground flex flex-col">
                <PublicHeader label="Onboarding" showLogin={false} />
                <div className="flex-1 flex items-center justify-center p-6">
                    <div className="max-w-md w-full bg-surface-card border border-border-card rounded-3xl p-8 text-center space-y-3 shadow-xl">
                        <div className="mx-auto h-14 w-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center"><Lock className="h-7 w-7 text-amber-500" /></div>
                        <h1 className="text-lg font-black text-text-primary">Link no longer valid</h1>
                        <p className="text-sm text-text-secondary">{reasonText} Please contact Pristine Health and we&apos;ll send you a new one.</p>
                        <Link href="/jobs" className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-primary hover:text-brand-primary-dark pt-1"><ArrowLeft className="h-3.5 w-3.5" /> Back to careers</Link>
                    </div>
                </div>
            </div>
        );
    }
    if (submitted) {
        return (
            <div className="min-h-screen bg-background text-foreground flex flex-col">
                <PublicHeader label="Onboarding" showLogin={false} />
                <div className="flex-1 flex items-center justify-center p-6">
                    <div className="max-w-md w-full bg-surface-card border border-border-card rounded-3xl p-8 text-center space-y-4 shadow-xl">
                        <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-400/20 to-emerald-600/10 border border-emerald-500/20 flex items-center justify-center"><PartyPopper className="h-8 w-8 text-emerald-500" /></div>
                        <div className="space-y-1.5">
                            <h1 className="text-xl font-black text-text-primary">Onboarding submitted</h1>
                            <p className="text-sm text-text-secondary">Thank you, {payload?.applicantName?.split(' ')[0] || 'and welcome'}! Our team will review your submission and reach out with next steps. You can safely close this page.</p>
                        </div>
                        <div className="flex items-center justify-center gap-3 pt-1">
                            <Link href="/jobs/track" className="inline-flex items-center gap-1.5 text-xs font-bold ui-card-soft text-text-secondary hover:text-text-primary px-4 py-2 rounded-xl">Track application</Link>
                            <Link href="/jobs" className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-primary hover:text-brand-primary-dark px-4 py-2 rounded-xl">Careers <ArrowLeft className="h-3.5 w-3.5 rotate-180" /></Link>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground pb-16">
            <PublicHeader label="Onboarding" showLogin={false} />
            {/* Branded hero — the team photo with a dark overlay for legibility,
                finished with a thin brand accent line. */}
            <div className="relative overflow-hidden">
                <div className="absolute inset-0" style={{ backgroundImage: "url('/healthcare_professionals_diversity.png')", backgroundSize: 'cover', backgroundPosition: 'center 25%' }} />
                <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/85 to-slate-950/55" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-slate-950/20" />
                <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
                    <p className="text-[11px] uppercase tracking-[0.25em] font-bold text-brand-primary mb-2">Employee Onboarding</p>
                    <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">Welcome{payload?.applicantName ? `, ${payload.applicantName}` : ''}</h1>
                    <p className="text-sm text-white/85 mt-2 max-w-xl">Complete your onboarding for <strong className="text-white">{payload?.jobTitle}</strong>. Your progress is saved whenever you click Save.</p>
                    {payload?.expiresAt && <p className="text-xs text-white/55 mt-2">This secure link expires {new Date(payload.expiresAt).toLocaleDateString()}.</p>}
                    {/* Overall progress */}
                    <div className="mt-6 max-w-md">
                        <div className="flex items-center justify-between text-[11px] font-bold text-white/75 mb-2">
                            <span>Progress</span><span>{completedCount} / {totalTrackable} sections</span>
                        </div>
                        <div className="h-2 rounded-full bg-white/15 overflow-hidden">
                            <div className="h-full rounded-full bg-brand-primary transition-all" style={{ width: `${Math.round((completedCount / totalTrackable) * 100)}%` }} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 sm:px-6 -mt-8 relative z-10">
                <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6 lg:gap-8">
                    {/* Step rail */}
                    <div className="lg:sticky lg:top-6 self-start">
                        <div className="bg-surface-card border border-border-card rounded-2xl p-4 shadow-lg">
                            <ol className="space-y-1.5">
                                {steps.map((s, i) => {
                                    const done = s.kind !== 'review' && stepComplete(s);
                                    const isCurrent = i === safeStep;
                                    const Icon = s.kind === 'questionnaire' ? ClipboardList : s.kind === 'documents' ? ShieldCheck : CheckCircle2;
                                    return (
                                        <li key={i}>
                                            <button onClick={() => setStepIndex(i)}
                                                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-left text-xs font-bold transition-colors ${isCurrent ? 'bg-brand-primary text-white shadow-sm shadow-brand-primary/20' : done ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/5' : 'text-text-secondary hover:bg-white/[0.03]'}`}>
                                                {done && !isCurrent ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <Icon className="h-4 w-4 shrink-0" />}
                                                <span className="truncate">{s.label}</span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ol>
                        </div>

                        {resources.length > 0 && (
                            <div className="bg-surface-card border border-border-card rounded-2xl p-5 shadow-sm mt-5 space-y-2.5">
                                <p className="text-[10px] font-black uppercase tracking-wider text-text-muted">Forms &amp; Resources</p>
                                {resources.map((f) => (
                                    <a key={f._id} href={f.downloadRef} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs font-semibold text-brand-primary hover:text-brand-primary-dark">
                                        <Download className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{f.title}</span>
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Active step */}
                    <div className="space-y-5">
                        {pageError && <div className="p-3.5 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-500 text-sm flex items-center gap-2"><AlertCircle className="h-4 w-4" />{pageError}</div>}
                        {message && <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-500 text-sm flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />{message}</div>}

                        <div className="bg-surface-card border border-border-card rounded-2xl p-6 sm:p-8 shadow-lg min-h-[340px]">
                            {current?.kind === 'questionnaire' && (
                                <QuestionnaireStep q={current.q} answers={answers[current.q.responseId] || {}}
                                    setAnswer={(name: string, v: any) => setAnswer(current.q.responseId, name, v)}
                                    onFile={(field: CustomField, file: File | null) => onAnswerFile(current.q.responseId, field, file)}
                                    fileNames={answerFileNames[current.q.responseId] || {}} busyKey={busyKey}
                                    fieldErrors={fieldErrors} previewNew={previewNew} previewExisting={previewExisting} />
                            )}
                            {current?.kind === 'documents' && (
                                <DocumentsStep requirements={requirements} docUploads={docUploads} docIsFile={docIsFile}
                                    onDocFile={onDocFile} onDocValue={onDocValue} busyKey={busyKey} fieldErrors={fieldErrors}
                                    previewNew={previewNew} previewExisting={previewExisting} />
                            )}
                            {current?.kind === 'review' && (
                                <ReviewStep questionnaires={questionnaires} requirements={requirements}
                                    questionnaireComplete={questionnaireComplete} docProvided={docProvided} onJump={(i: number) => setStepIndex(i)} steps={steps} />
                            )}
                        </div>

                        {/* Footer nav */}
                        <div className="flex items-center justify-between gap-3 pt-1">
                            <button onClick={() => setStepIndex(Math.max(0, safeStep - 1))} disabled={safeStep === 0}
                                className="px-4 py-2.5 rounded-xl text-xs font-bold ui-card-soft text-text-secondary disabled:opacity-40 inline-flex items-center gap-1.5">
                                <ArrowLeft className="h-4 w-4" /> Back
                            </button>
                            <div className="flex items-center gap-2.5">
                                <button onClick={() => persist(false)} disabled={saving !== null}
                                    className="px-4 py-2.5 rounded-xl text-xs font-bold ui-card-soft text-text-secondary disabled:opacity-60 inline-flex items-center gap-1.5">
                                    {saving === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save progress
                                </button>
                                {current?.kind === 'review' ? (
                                    <button onClick={() => persist(true)} disabled={saving !== null}
                                        className="px-6 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-60 inline-flex items-center gap-1.5">
                                        {saving === 'submit' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Submit onboarding
                                    </button>
                                ) : (
                                    <button onClick={() => setStepIndex(Math.min(steps.length - 1, safeStep + 1))}
                                        className="px-6 py-2.5 rounded-xl text-xs font-bold bg-brand-primary text-white hover:bg-brand-primary-dark inline-flex items-center gap-1.5">
                                        Next <ArrowLeft className="h-4 w-4 rotate-180" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Step components ──────────────────────────────────────────────────────────
function FieldInput({ field, value, setValue, onFile, fileName, busyKey, fieldErrors, rid, previewNew, previewExisting }: any) {
    const ftype = resolveFieldType(field);
    const ek = `${rid}:${field.name}`;
    return (
        <div className="space-y-1.5">
            <label className="text-xs font-bold text-text-secondary">{field.label}{field.required && <span className="text-rose-500 ml-1">*</span>}</label>
            {ftype === 'paragraph' ? (
                <textarea rows={4} value={value || ''} onChange={(e) => setValue(e.target.value)} className="ui-input w-full text-sm" />
            ) : ftype === 'number' ? (
                <input type="number" value={value ?? ''} onChange={(e) => setValue(e.target.value)} className="ui-input w-full text-sm" />
            ) : ftype === 'date' ? (
                <input type="date" value={toDateInputValue(value)} onChange={(e) => setValue(e.target.value)} className="ui-input w-full text-sm [color-scheme:light] dark:[color-scheme:dark]" />
            ) : ftype === 'select' ? (
                <select value={value || ''} onChange={(e) => setValue(e.target.value)} className="ui-input w-full text-sm">
                    <option value="">Select…</option>
                    {(field.options || []).map((o: string) => <option key={o} value={o}>{o}</option>)}
                </select>
            ) : ftype === 'checkbox' ? (
                <div className="flex flex-wrap gap-2">
                    {(field.options || []).map((o: string) => {
                        const arr: string[] = Array.isArray(value) ? value : [];
                        const on = arr.includes(o);
                        return <button type="button" key={o} onClick={() => setValue(on ? arr.filter((x) => x !== o) : [...arr, o])}
                            className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${on ? 'bg-brand-primary text-white border-brand-primary' : 'ui-card-soft text-text-secondary border-border-card'}`}>{o}</button>;
                    })}
                </div>
            ) : ftype === 'file' ? (
                (() => {
                    const isExisting = typeof value === 'string' && value.startsWith('/api/');
                    const isNew = typeof value === 'string' && value && !value.startsWith('/api/');
                    if (isExisting || isNew) return (
                        <div className="flex items-center gap-3">
                            <button type="button" onClick={() => (isExisting ? previewExisting(value) : previewNew(value))} className="text-xs font-semibold text-brand-primary inline-flex items-center gap-1"><Eye className="h-3 w-3" /> {isNew ? (fileName || 'Uploaded file') : 'View uploaded file'}</button>
                            <label className="text-xs font-bold text-brand-primary cursor-pointer">Replace<input type="file" className="hidden" accept={ALLOWED.join(',')} onChange={(e) => onFile(field, e.target.files?.[0] || null)} /></label>
                        </div>
                    );
                    return (
                        <label className="w-full flex items-center justify-center gap-2 border border-dashed border-border-input rounded-xl p-4 cursor-pointer text-text-secondary text-xs">
                            {busyKey === ek ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload file
                            <input type="file" className="hidden" accept={ALLOWED.join(',')} onChange={(e) => onFile(field, e.target.files?.[0] || null)} />
                        </label>
                    );
                })()
            ) : (
                <input type="text" value={value || ''} onChange={(e) => setValue(e.target.value)} className="ui-input w-full text-sm" />
            )}
            {fieldErrors[ek] && <p className="text-xs text-rose-500">{fieldErrors[ek]}</p>}
        </div>
    );
}

function QuestionnaireStep({ q, answers, setAnswer, onFile, fileNames, busyKey, fieldErrors, previewNew, previewExisting }: any) {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-2 pb-1 border-b border-border-card">
                <h2 className="text-sm font-black uppercase tracking-widest text-brand-primary">{q.formName}</h2>
                {q.status === 'completed' && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Completed</span>}
            </div>
            {q.fields.length === 0 ? <p className="text-sm text-text-muted">No questions.</p> : q.fields.map((field: CustomField) => (
                <FieldInput key={field.name} field={field} rid={q.responseId} value={answers[field.name]} fileName={fileNames[field.name]}
                    setValue={(v: any) => setAnswer(field.name, v)} onFile={onFile} busyKey={busyKey} fieldErrors={fieldErrors}
                    previewNew={previewNew} previewExisting={previewExisting} />
            ))}
        </div>
    );
}

function DocumentsStep({ requirements, docUploads, docIsFile, onDocFile, onDocValue, busyKey, fieldErrors, previewNew, previewExisting }: any) {
    return (
        <div className="space-y-5">
            <h2 className="text-sm font-black uppercase tracking-widest text-brand-primary pb-1 border-b border-border-card">Required documents</h2>
            {requirements.map((r: Requirement) => {
                const u = docUploads[r.documentType] || {};
                const isFile = docIsFile(r);
                return (
                    <div key={r.documentType} className="border border-border-card rounded-xl p-5 space-y-3">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-bold text-text-primary">{r.label || getDocumentLabel(r.documentType as DocumentType)}</h3>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase bg-amber-500/10 text-amber-500 border-amber-500/20">Required</span>
                        </div>
                        {isFile ? (
                            u.publicId || u.fileRef ? (
                                <div className="flex items-center gap-3">
                                    <button type="button" onClick={() => (u.publicId ? previewNew(u.publicId) : previewExisting(u.fileRef))} className="text-xs font-semibold text-brand-primary inline-flex items-center gap-1"><Eye className="h-3 w-3" /> {u.fileName || 'View uploaded file'}</button>
                                    <label className="text-xs font-bold text-brand-primary cursor-pointer">Replace<input type="file" className="hidden" accept={ALLOWED.join(',')} onChange={(e) => onDocFile(r.documentType, e.target.files?.[0] || null)} /></label>
                                </div>
                            ) : (
                                <label className="w-full flex items-center justify-center gap-2 border border-dashed border-border-input rounded-xl p-4 cursor-pointer text-text-secondary text-xs">
                                    {busyKey === r.documentType ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload {r.label}
                                    <input type="file" className="hidden" accept={ALLOWED.join(',')} onChange={(e) => onDocFile(r.documentType, e.target.files?.[0] || null)} />
                                </label>
                            )
                        ) : (
                            <input type="text" value={u.value || ''} onChange={(e) => onDocValue(r.documentType, e.target.value)}
                                placeholder={metadataInputProps(r.documentType as DocumentType).placeholder || `Enter ${r.label}`}
                                inputMode={metadataInputProps(r.documentType as DocumentType).inputMode}
                                maxLength={metadataInputProps(r.documentType as DocumentType).maxLength}
                                className="ui-input w-full text-sm" />
                        )}
                        {fieldErrors[r.documentType] && <p className="text-xs text-rose-500">{fieldErrors[r.documentType]}</p>}
                    </div>
                );
            })}
        </div>
    );
}

function ReviewStep({ questionnaires, requirements, questionnaireComplete, docProvided, onJump, steps }: any) {
    const rows: Array<{ label: string; done: boolean; stepIndex: number }> = [];
    questionnaires.forEach((q: Questionnaire, i: number) => rows.push({ label: q.formName, done: questionnaireComplete(q), stepIndex: i }));
    if (requirements.length > 0) {
        const docStep = steps.findIndex((s: Step) => s.kind === 'documents');
        requirements.forEach((r: Requirement) => rows.push({ label: r.label, done: docProvided(r), stepIndex: docStep }));
    }
    const allDone = rows.every((r) => r.done);
    return (
        <div className="space-y-4">
            <h2 className="text-sm font-black uppercase tracking-widest text-brand-primary">Review &amp; submit</h2>
            <p className="text-xs text-text-muted">Make sure everything below is complete, then submit.</p>
            <div className="space-y-2">
                {rows.map((r, i) => (
                    <button key={i} onClick={() => onJump(r.stepIndex)} className="w-full flex items-center justify-between gap-3 border border-border-card rounded-xl p-3 hover:border-brand-primary/40 transition-colors text-left">
                        <span className="text-sm font-semibold text-text-primary">{r.label}</span>
                        {r.done
                            ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase bg-emerald-500/10 text-emerald-500 border-emerald-500/20 inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Done</span>
                            : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase bg-amber-500/10 text-amber-500 border-amber-500/20">Incomplete</span>}
                    </button>
                ))}
            </div>
            {!allDone && <p className="text-xs text-amber-600 dark:text-amber-400">Some required items are still incomplete — you can still submit, but completing them helps us process your onboarding faster.</p>}
        </div>
    );
}
