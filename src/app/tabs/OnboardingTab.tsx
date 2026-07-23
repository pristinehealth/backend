"use client";

import { useEffect, useMemo, useState } from "react";
import {
    Loader2, Plus, Trash2, X, Search, ClipboardList, UserCheck, Eye, CheckCircle2, Edit, ChevronLeft, ChevronRight, FileText, Download,
    GripVertical, ChevronUp, ChevronDown,
} from "lucide-react";
import { resolveFieldType, toDateInputValue } from "@/lib/formFields";
import { downloadOnboardingPdf, toOnboardingPdfData } from "@/lib/pdf/onboarding";

type FieldType = 'text' | 'paragraph' | 'number' | 'select' | 'checkbox' | 'file' | 'date';

interface CustomField {
    name: string;
    label: string;
    type: FieldType;
    required: boolean;
    options?: string[];
    section?: string;
}

interface OnboardingForm {
    _id: string;
    name: string;
    customFields: CustomField[];
}

type OnboardingStatus = 'not_started' | 'in_progress' | 'completed';

interface OnboardingRow {
    _id: string; // application id
    applicantName: string;
    applicantEmail: string;
    jobId: string;
    jobTitle: string;
    acceptedAt: string;
    onboardingStatus: OnboardingStatus;
    onboarding: { _id: string; status: string } | null;
}

const DEFAULT_SECTION = 'Onboarding questions';
const normalizeFieldKey = (v: string) =>
    v.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

const STATUS_META: Record<OnboardingStatus, { label: string; cls: string }> = {
    not_started: { label: 'Not started', cls: 'bg-slate-500/10 text-slate-500 border-slate-500/20' },
    in_progress: { label: 'In progress', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
    completed: { label: 'Completed', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
};

const FIELD_TYPE_OPTIONS: { value: FieldType; label: string }[] = [
    { value: 'text', label: 'Short Answer' },
    { value: 'paragraph', label: 'Paragraph Text' },
    { value: 'number', label: 'Number Input' },
    { value: 'date', label: 'Date Picker' },
    { value: 'select', label: 'Dropdown Selection' },
    { value: 'checkbox', label: 'Checkbox Selections' },
    { value: 'file', label: 'File Upload' },
];

export function OnboardingTab() {
    const [subTab, setSubTab] = useState<'candidates' | 'questionnaires'>('candidates');
    const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);

    // ── Questionnaires (builder) ──────────────────────────────────────────
    const [forms, setForms] = useState<OnboardingForm[]>([]);
    const [loadingForms, setLoadingForms] = useState(true);
    const [showFormModal, setShowFormModal] = useState(false);
    const [editingFormId, setEditingFormId] = useState<string | null>(null);
    const [formName, setFormName] = useState("");
    const [formFields, setFormFields] = useState<CustomField[]>([]);
    const [fieldName, setFieldName] = useState("");
    const [fieldLabel, setFieldLabel] = useState("");
    const [fieldType, setFieldType] = useState<FieldType>('text');
    const [fieldRequired, setFieldRequired] = useState(false);
    const [fieldOptionsRaw, setFieldOptionsRaw] = useState("");
    const [fieldSection, setFieldSection] = useState(DEFAULT_SECTION);
    const [savingForm, setSavingForm] = useState(false);
    // Drag-to-reorder state for the question list. `armedDragIdx` gates the row's
    // `draggable` flag to the grip handle so the inline inputs stay selectable.
    const [dragFieldIdx, setDragFieldIdx] = useState<number | null>(null);
    const [dragOverFieldIdx, setDragOverFieldIdx] = useState<number | null>(null);
    const [armedDragIdx, setArmedDragIdx] = useState<number | null>(null);

    // ── Candidates list ───────────────────────────────────────────────────
    const [rows, setRows] = useState<OnboardingRow[]>([]);
    const [loadingRows, setLoadingRows] = useState(true);
    const [statusFilter, setStatusFilter] = useState<'' | OnboardingStatus>('');
    const [jobFilter, setJobFilter] = useState("");
    const [q, setQ] = useState("");
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [jobOptions, setJobOptions] = useState<{ _id: string; title: string }[]>([]);
    const pageSize = 20;

    // ── Start-onboarding modal ────────────────────────────────────────────
    const [startRow, setStartRow] = useState<OnboardingRow | null>(null);
    const [pickFormId, setPickFormId] = useState("");
    const [starting, setStarting] = useState(false);

    // ── Answer editor modal ───────────────────────────────────────────────
    const [editorId, setEditorId] = useState<string | null>(null);
    const [editorLoading, setEditorLoading] = useState(false);
    const [editorForm, setEditorForm] = useState<{ name: string; customFields: CustomField[] }>({ name: '', customFields: [] });
    const [editorMeta, setEditorMeta] = useState<{ applicantName: string; jobTitle: string; status: string }>({ applicantName: '', jobTitle: '', status: '' });
    const [editorResponse, setEditorResponse] = useState<any>(null);
    const [editorAnswers, setEditorAnswers] = useState<Record<string, any>>({});
    const [savingAnswers, setSavingAnswers] = useState(false);
    const [uploadingField, setUploadingField] = useState<string | null>(null);
    const [viewerFile, setViewerFile] = useState<{ url: string; name: string } | null>(null);

    // ── Data loads ────────────────────────────────────────────────────────
    const fetchForms = async () => {
        setLoadingForms(true);
        try {
            const res = await fetch('/api/admin/onboarding-forms');
            const data = await res.json();
            setForms(Array.isArray(data?.data) ? data.data : []);
        } catch {
            setForms([]);
        } finally {
            setLoadingForms(false);
        }
    };

    const fetchJobs = async () => {
        try {
            const res = await fetch('/api/admin/jobs?limit=0');
            const data = await res.json();
            const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
            setJobOptions(list.map((j: any) => ({ _id: String(j._id), title: j.title })));
        } catch {
            setJobOptions([]);
        }
    };

    const fetchRows = async () => {
        setLoadingRows(true);
        try {
            const params = new URLSearchParams();
            if (statusFilter) params.set('onboardingStatus', statusFilter);
            if (jobFilter) params.set('jobId', jobFilter);
            if (q.trim()) params.set('q', q.trim());
            params.set('page', String(page));
            const res = await fetch(`/api/admin/onboarding?${params.toString()}`);
            const data = await res.json();
            setRows(Array.isArray(data?.data) ? data.data : []);
            setTotal(typeof data?.total === 'number' ? data.total : 0);
        } catch {
            setRows([]);
            setTotal(0);
        } finally {
            setLoadingRows(false);
        }
    };

    useEffect(() => { void fetchForms(); void fetchJobs(); }, []);
    useEffect(() => {
        if (subTab === 'candidates') void fetchRows();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subTab, statusFilter, jobFilter, page]);

    // Debounced search
    useEffect(() => {
        if (subTab !== 'candidates') return;
        const t = setTimeout(() => { setPage(1); void fetchRows(); }, 350);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q]);

    useEffect(() => {
        if (!viewerFile) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setViewerFile(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [viewerFile]);

    // ── Builder handlers ──────────────────────────────────────────────────
    const openCreateForm = () => {
        setEditingFormId(null);
        setFormName("");
        setFormFields([]);
        setFieldName(""); setFieldLabel(""); setFieldType('text'); setFieldRequired(false); setFieldOptionsRaw(""); setFieldSection(DEFAULT_SECTION);
        setShowFormModal(true);
    };
    const openEditForm = (form: OnboardingForm) => {
        setEditingFormId(form._id);
        setFormName(form.name);
        setFormFields(form.customFields || []);
        setShowFormModal(true);
    };

    const handleAddField = () => {
        if (!fieldName || !fieldLabel) return;
        const key = normalizeFieldKey(fieldName);
        if (!key) {
            setAlert({ title: 'Invalid field key', message: 'Use letters, numbers, and underscores only.' });
            return;
        }
        if (formFields.some((f) => f.name === key)) {
            setAlert({ title: 'Duplicate', message: 'A question with this identifier already exists.' });
            return;
        }
        const options = (fieldType === 'select' || fieldType === 'checkbox') && fieldOptionsRaw.trim()
            ? fieldOptionsRaw.split(',').map((o) => o.trim()).filter(Boolean)
            : undefined;
        setFormFields([...formFields, { name: key, label: fieldLabel, type: fieldType, required: fieldRequired, options, section: fieldSection.trim() || DEFAULT_SECTION }]);
        setFieldName(""); setFieldLabel(""); setFieldType('text'); setFieldRequired(false); setFieldOptionsRaw("");
    };
    const handleRemoveField = (index: number) => setFormFields(formFields.filter((_, i) => i !== index));

    // Questions render in array order in the answer editor and the PDF, so moving
    // a row here is all that's needed to reorder — no delete-and-recreate.
    const moveField = (from: number, to: number) => {
        setFormFields((prev) => {
            if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
            const next = [...prev];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            return next;
        });
    };

    const handleFieldDrop = (targetIdx: number) => {
        if (dragFieldIdx !== null) moveField(dragFieldIdx, targetIdx);
        setDragFieldIdx(null);
        setDragOverFieldIdx(null);
    };

    // Edits the wording/placement of an existing question. `name` stays fixed —
    // saved answers are keyed by it (OnboardingResponse.answers is a Map), so
    // renaming would orphan every answer already recorded against this form.
    const updateField = (index: number, patch: Partial<CustomField>) => {
        setFormFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
    };

    const handleSaveForm = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formName.trim()) return;
        if (formFields.length === 0) {
            setAlert({ title: 'No questions', message: 'Add at least one question before saving.' });
            return;
        }
        // Questions are editable in place, so re-check them here rather than only
        // at add time — a blanked-out label should never reach the questionnaire.
        const cleanedFields = formFields.map((f) => ({
            ...f,
            label: f.label.trim(),
            section: (f.section || '').trim() || DEFAULT_SECTION,
        }));
        if (cleanedFields.some((f) => !f.label)) {
            setAlert({ title: 'Missing label', message: 'Every question needs a label. Fill in the blank ones or remove them.' });
            return;
        }
        setSavingForm(true);
        try {
            const url = editingFormId ? `/api/admin/onboarding-forms/${editingFormId}` : '/api/admin/onboarding-forms';
            const method = editingFormId ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: formName.trim(), customFields: cleanedFields }),
            });
            const data = await res.json();
            if (!res.ok) {
                setAlert({ title: 'Save failed', message: data?.error || 'Could not save questionnaire.' });
                return;
            }
            setShowFormModal(false);
            await fetchForms();
        } finally {
            setSavingForm(false);
        }
    };

    const handleDeleteForm = async (form: OnboardingForm) => {
        if (!confirm(`Delete "${form.name}"?`)) return;
        const res = await fetch(`/api/admin/onboarding-forms/${form._id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) {
            setAlert({ title: 'Delete failed', message: data?.error || 'Could not delete questionnaire.' });
            return;
        }
        await fetchForms();
    };

    // ── Candidate handlers ────────────────────────────────────────────────
    const handleStartOnboarding = async () => {
        if (!startRow || !pickFormId) return;
        setStarting(true);
        try {
            const res = await fetch('/api/admin/onboarding', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ applicationId: startRow._id, onboardingFormId: pickFormId }),
            });
            const data = await res.json();
            if (!res.ok) {
                setAlert({ title: 'Could not start', message: data?.error || 'Failed to start onboarding.' });
                return;
            }
            setStartRow(null);
            setPickFormId("");
            await fetchRows();
            if (data?.data?._id) void openEditor(data.data._id);
        } finally {
            setStarting(false);
        }
    };

    const openEditor = async (responseId: string) => {
        setEditorId(responseId);
        setEditorLoading(true);
        try {
            const res = await fetch(`/api/admin/onboarding/${responseId}`);
            const data = await res.json();
            if (!res.ok) {
                setAlert({ title: 'Load failed', message: data?.error || 'Could not load onboarding.' });
                setEditorId(null);
                return;
            }
            setEditorForm({ name: data.form?.name || '', customFields: data.form?.customFields || [] });
            setEditorMeta({
                applicantName: data.response?.applicantName || '',
                jobTitle: data.response?.jobTitle || '',
                status: data.response?.status || 'in_progress',
            });
            setEditorResponse(data.response || null);
            setEditorAnswers(data.response?.answers || {});
        } finally {
            setEditorLoading(false);
        }
    };

    const handleEditorFileUpload = async (fieldKey: string, file: File | null) => {
        if (!file) return;
        setUploadingField(fieldKey);
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('source', 'admin');
            fd.append('usageType', 'custom_field');
            const res = await fetch('/api/upload', { method: 'POST', body: fd });
            const data = await res.json();
            if (res.ok && data?.url) {
                setEditorAnswers((prev) => ({ ...prev, [fieldKey]: data.url }));
            } else {
                setAlert({ title: 'Upload failed', message: data?.error || 'Could not upload file.' });
            }
        } finally {
            setUploadingField(null);
        }
    };

    const saveAnswers = async (markComplete: boolean) => {
        if (!editorId) return;
        setSavingAnswers(true);
        try {
            const res = await fetch(`/api/admin/onboarding/${editorId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ answers: editorAnswers, status: markComplete ? 'completed' : 'in_progress' }),
            });
            const data = await res.json();
            if (!res.ok) {
                setAlert({ title: 'Save failed', message: data?.error || 'Could not save answers.' });
                return;
            }
            setEditorMeta((m) => ({ ...m, status: markComplete ? 'completed' : 'in_progress' }));
            if (markComplete) setEditorId(null);
            await fetchRows();
        } finally {
            setSavingAnswers(false);
        }
    };

    const handleExportPdf = () => {
        if (!editorResponse) return;
        // Reflect what's currently shown (incl. unsaved edits + current status).
        const response = { ...editorResponse, answers: editorAnswers, status: editorMeta.status };
        const form = { name: editorForm.name, customFields: editorForm.customFields };
        downloadOnboardingPdf(toOnboardingPdfData(response, form));
    };

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    // ── Field editor renderer ─────────────────────────────────────────────
    const renderAnswerField = (field: CustomField) => {
        const ftype = resolveFieldType(field);
        const val = editorAnswers[field.name];
        const set = (v: any) => setEditorAnswers((prev) => ({ ...prev, [field.name]: v }));

        if (ftype === 'paragraph') {
            return <textarea rows={4} value={val || ''} onChange={(e) => set(e.target.value)} className="ui-input w-full text-sm" />;
        }
        if (ftype === 'number') {
            return <input type="number" value={val ?? ''} onChange={(e) => set(e.target.value)} className="ui-input w-full text-sm" />;
        }
        if (ftype === 'date') {
            return <input type="date" value={toDateInputValue(val)} onChange={(e) => set(e.target.value)} onClick={(e) => { try { (e.currentTarget as any).showPicker?.(); } catch {} }} className="ui-input w-full text-sm cursor-pointer [color-scheme:light] dark:[color-scheme:dark]" />;
        }
        if (ftype === 'select') {
            return (
                <select value={val || ''} onChange={(e) => set(e.target.value)} className="ui-input w-full text-sm">
                    <option value="">Select an option…</option>
                    {(field.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
            );
        }
        if (ftype === 'checkbox') {
            const arr: string[] = Array.isArray(val) ? val : [];
            return (
                <div className="space-y-1.5 bg-surface-card border border-border-card rounded-xl p-3">
                    {(field.options || []).map((o) => (
                        <label key={o} className="flex items-center gap-2 text-xs text-text-secondary font-semibold cursor-pointer">
                            <input
                                type="checkbox"
                                checked={arr.includes(o)}
                                onChange={(e) => set(e.target.checked ? [...arr, o] : arr.filter((x) => x !== o))}
                                className="h-4 w-4 rounded"
                            />
                            {o}
                        </label>
                    ))}
                </div>
            );
        }
        if (ftype === 'file') {
            return val ? (
                <div className="flex items-center justify-between gap-3 border border-border-card rounded-xl p-3 bg-surface-card">
                    <button type="button" onClick={() => setViewerFile({ url: `/api/admin/file?src=${encodeURIComponent(val)}`, name: field.label })} className="text-xs font-bold text-brand-primary inline-flex items-center gap-1">
                        <Eye className="h-3.5 w-3.5" /> View file
                    </button>
                    <button type="button" onClick={() => set('')} className="text-xs font-bold text-rose-500">Clear</button>
                </div>
            ) : (
                <label className="flex items-center justify-center gap-2 border border-dashed border-border-input rounded-xl p-3 text-xs text-text-secondary cursor-pointer hover:border-brand-primary/40">
                    <input type="file" className="hidden" disabled={uploadingField === field.name} onChange={(e) => handleEditorFileUpload(field.name, e.target.files?.[0] || null)} />
                    {uploadingField === field.name ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</> : 'Upload file'}
                </label>
            );
        }
        return <input type="text" value={val || ''} onChange={(e) => set(e.target.value)} className="ui-input w-full text-sm" />;
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-black text-text-primary tracking-tight">Onboarding</h2>
                <p className="text-sm text-text-muted mt-1">Build onboarding questionnaires and complete them for accepted candidates.</p>
            </div>

            {/* Sub-tabs */}
            <div className="flex items-center gap-2">
                {([
                    { id: 'candidates' as const, label: 'Candidates', icon: UserCheck },
                    { id: 'questionnaires' as const, label: 'Questionnaires', icon: ClipboardList },
                ]).map((t) => {
                    const Icon = t.icon;
                    return (
                        <button
                            key={t.id}
                            onClick={() => setSubTab(t.id)}
                            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${subTab === t.id ? 'bg-brand-primary text-white border-brand-primary' : 'ui-card-soft text-text-secondary hover:text-text-primary'}`}
                        >
                            <Icon className="h-4 w-4" /> {t.label}
                        </button>
                    );
                })}
            </div>

            {/* ── Candidates ─────────────────────────────────────────────── */}
            {subTab === 'candidates' && (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1">
                            {([
                                { v: '' as const, label: 'All' },
                                { v: 'not_started' as const, label: 'Not started' },
                                { v: 'in_progress' as const, label: 'In progress' },
                                { v: 'completed' as const, label: 'Completed' },
                            ]).map((s) => (
                                <button
                                    key={s.label}
                                    onClick={() => { setStatusFilter(s.v); setPage(1); }}
                                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${statusFilter === s.v ? 'bg-brand-primary text-white border-brand-primary' : 'ui-card-soft text-text-secondary'}`}
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>
                        <select value={jobFilter} onChange={(e) => { setJobFilter(e.target.value); setPage(1); }} className="ui-input text-xs">
                            <option value="">All positions</option>
                            {jobOptions.map((j) => <option key={j._id} value={j._id}>{j.title}</option>)}
                        </select>
                        <div className="relative flex-1 min-w-[180px] max-w-xs">
                            <Search className="h-4 w-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" className="ui-input w-full text-xs pl-9" />
                        </div>
                    </div>

                    <div className="crm-panel rounded-2xl overflow-hidden">
                        {loadingRows ? (
                            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-primary" /></div>
                        ) : rows.length === 0 ? (
                            <div className="text-center py-16 text-sm text-text-muted">No accepted candidates match these filters.</div>
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-[10px] uppercase tracking-wider text-text-muted border-b border-border-card">
                                        <th className="text-left font-bold px-4 py-3">Candidate</th>
                                        <th className="text-left font-bold px-4 py-3">Position</th>
                                        <th className="text-left font-bold px-4 py-3">Accepted</th>
                                        <th className="text-left font-bold px-4 py-3">Onboarding</th>
                                        <th className="text-right font-bold px-4 py-3">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row) => {
                                        const meta = STATUS_META[row.onboardingStatus];
                                        return (
                                            <tr key={row._id} className="border-b last:border-0 border-border-card">
                                                <td className="px-4 py-3">
                                                    <p className="font-bold text-text-primary">{row.applicantName}</p>
                                                    <p className="text-[11px] text-text-muted">{row.applicantEmail}</p>
                                                </td>
                                                <td className="px-4 py-3 text-text-secondary">{row.jobTitle}</td>
                                                <td className="px-4 py-3 text-text-muted text-xs">{new Date(row.acceptedAt).toLocaleDateString()}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase ${meta.cls}`}>{meta.label}</span>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    {row.onboarding ? (
                                                        <button onClick={() => openEditor(row.onboarding!._id)} className="inline-flex items-center gap-1 text-xs font-bold text-brand-primary hover:text-brand-primary-dark">
                                                            <Edit className="h-3.5 w-3.5" /> Open
                                                        </button>
                                                    ) : (
                                                        <button onClick={() => { setStartRow(row); setPickFormId(""); }} className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-brand-primary text-white hover:bg-brand-primary-dark">
                                                            <Plus className="h-3.5 w-3.5" /> Start onboarding
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {totalPages > 1 && (
                        <div className="flex justify-center items-center gap-2">
                            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg ui-card-soft disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
                            <span className="text-xs font-bold text-text-muted">Page {page} / {totalPages}</span>
                            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-lg ui-card-soft disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
                        </div>
                    )}
                </div>
            )}

            {/* ── Questionnaires ─────────────────────────────────────────── */}
            {subTab === 'questionnaires' && (
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-sm font-black text-text-primary">Onboarding Questionnaires</h3>
                        <button onClick={openCreateForm} className="inline-flex items-center gap-1.5 bg-brand-primary hover:bg-brand-primary-dark text-white font-bold text-xs px-4 py-2 rounded-xl">
                            <Plus className="h-4 w-4" /> Create questionnaire
                        </button>
                    </div>
                    {loadingForms ? (
                        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-primary" /></div>
                    ) : forms.length === 0 ? (
                        <div className="crm-panel rounded-2xl p-10 text-center text-sm text-text-muted">No onboarding questionnaires yet.</div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {forms.map((form) => (
                                <div key={form._id} className="crm-panel rounded-2xl p-5 space-y-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <p className="font-black text-text-primary">{form.name}</p>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button onClick={() => openEditForm(form)} className="text-xs font-bold text-brand-primary inline-flex items-center gap-1"><Edit className="h-3.5 w-3.5" /> Edit</button>
                                            <button onClick={() => handleDeleteForm(form)} className="text-xs font-bold text-rose-500 inline-flex items-center gap-1"><Trash2 className="h-3.5 w-3.5" /></button>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {(form.customFields || []).map((f) => (
                                            <span key={f.name} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-primary-muted text-brand-primary border border-brand-primary/15">{f.label} ({f.type})</span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Builder modal ──────────────────────────────────────────── */}
            {showFormModal && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-surface-modal border border-border-modal rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border-modal">
                            <h3 className="font-black text-text-primary">{editingFormId ? 'Edit' : 'Create'} Onboarding Questionnaire</h3>
                            <button onClick={() => setShowFormModal(false)} className="p-2 rounded-lg text-text-secondary hover:bg-white/[0.06]"><X className="h-4 w-4" /></button>
                        </div>
                        <form onSubmit={handleSaveForm} className="flex flex-col min-h-0 flex-1">
                            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-5">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Questionnaire Name</label>
                                <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. RN Onboarding Interview" className="ui-input w-full text-sm" required />
                            </div>

                            {formFields.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-[10px] text-text-muted">
                                        Edit the wording, section, or required flag in place. Drag the handle (or use the arrows)
                                        to reorder — questions are asked in this order.
                                    </p>
                                    {formFields.map((f, i) => (
                                        <div
                                            key={f.name}
                                            draggable={armedDragIdx === i}
                                            onDragStart={(e) => { setDragFieldIdx(i); e.dataTransfer.effectAllowed = 'move'; }}
                                            onDragEnd={() => { setDragFieldIdx(null); setDragOverFieldIdx(null); setArmedDragIdx(null); }}
                                            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverFieldIdx !== i) setDragOverFieldIdx(i); }}
                                            onDrop={(e) => { e.preventDefault(); handleFieldDrop(i); }}
                                            className={`flex items-start gap-2 bg-surface-card border rounded-xl px-3 py-2.5 transition-all ${
                                                dragFieldIdx === i
                                                    ? 'opacity-40 border-brand-primary/60'
                                                    : dragOverFieldIdx === i && dragFieldIdx !== null
                                                        ? 'border-brand-primary ring-2 ring-brand-primary/30'
                                                        : 'border-border-card'
                                            }`}
                                        >
                                            <div className="shrink-0 flex items-center gap-1 pt-1.5">
                                                <span
                                                    onMouseDown={() => setArmedDragIdx(i)}
                                                    onMouseUp={() => setArmedDragIdx(null)}
                                                    title="Drag to reorder"
                                                    className="cursor-grab active:cursor-grabbing text-text-muted hover:text-text-primary"
                                                >
                                                    <GripVertical className="h-4 w-4" />
                                                </span>
                                                <span className="w-4 text-center text-[10px] font-bold text-text-muted">{i + 1}</span>
                                                <div className="flex flex-col -space-y-0.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => moveField(i, i - 1)}
                                                        disabled={i === 0}
                                                        title="Move up"
                                                        aria-label={`Move ${f.label} up`}
                                                        className="text-text-muted hover:text-brand-primary disabled:opacity-25 disabled:hover:text-text-muted"
                                                    >
                                                        <ChevronUp className="h-3.5 w-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => moveField(i, i + 1)}
                                                        disabled={i === formFields.length - 1}
                                                        title="Move down"
                                                        aria-label={`Move ${f.label} down`}
                                                        className="text-text-muted hover:text-brand-primary disabled:opacity-25 disabled:hover:text-text-muted"
                                                    >
                                                        <ChevronDown className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="min-w-0 flex-1 space-y-1.5">
                                                <input
                                                    value={f.label}
                                                    onChange={(e) => updateField(i, { label: e.target.value })}
                                                    placeholder="Question label"
                                                    aria-label="Question label"
                                                    className="ui-input w-full text-sm font-bold py-1.5"
                                                />
                                                {(f.type === 'select' || f.type === 'checkbox') && (
                                                    <input
                                                        value={(f.options || []).join(', ')}
                                                        onChange={(e) => updateField(i, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })}
                                                        placeholder="Options (comma separated)"
                                                        aria-label="Options"
                                                        className="ui-input w-full text-xs py-1.5"
                                                    />
                                                )}
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-[10px] font-mono text-text-muted">{f.name}</span>
                                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-brand-primary-muted text-brand-primary border border-brand-primary/15">{f.type}</span>
                                                    <input
                                                        value={f.section || ''}
                                                        onChange={(e) => updateField(i, { section: e.target.value })}
                                                        placeholder={DEFAULT_SECTION}
                                                        aria-label="Section"
                                                        className="ui-input text-[11px] py-1 px-2 w-44"
                                                    />
                                                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-text-secondary cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={f.required}
                                                            onChange={(e) => updateField(i, { required: e.target.checked })}
                                                            className="h-3.5 w-3.5 rounded"
                                                        /> Required
                                                    </label>
                                                </div>
                                            </div>
                                            <button type="button" onClick={() => handleRemoveField(i)} title="Remove question" aria-label={`Remove ${f.label}`} className="text-rose-500 text-xs font-bold shrink-0 pt-1.5"><Trash2 className="h-4 w-4" /></button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="rounded-xl border border-border-card p-4 space-y-3">
                                <p className="text-[10px] font-black uppercase tracking-wider text-text-muted">Add a question</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <input value={fieldLabel} onChange={(e) => { setFieldLabel(e.target.value); if (!editingFormId || !fieldName) setFieldName(normalizeFieldKey(e.target.value)); }} placeholder="Question label" className="ui-input text-sm" />
                                    <input value={fieldName} onChange={(e) => setFieldName(e.target.value)} placeholder="field_key" className="ui-input text-sm font-mono" />
                                    <select value={fieldType} onChange={(e) => setFieldType(e.target.value as FieldType)} className="ui-input text-sm">
                                        {FIELD_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                    <input value={fieldSection} onChange={(e) => setFieldSection(e.target.value)} placeholder="Section" className="ui-input text-sm" />
                                    {(fieldType === 'select' || fieldType === 'checkbox') && (
                                        <input value={fieldOptionsRaw} onChange={(e) => setFieldOptionsRaw(e.target.value)} placeholder="Options (comma separated)" className="ui-input text-sm sm:col-span-2" />
                                    )}
                                </div>
                                <div className="flex items-center justify-between">
                                    <label className="flex items-center gap-2 text-xs font-semibold text-text-secondary cursor-pointer">
                                        <input type="checkbox" checked={fieldRequired} onChange={(e) => setFieldRequired(e.target.checked)} className="h-4 w-4 rounded" /> Required
                                    </label>
                                    <button type="button" onClick={handleAddField} className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-brand-primary text-white hover:bg-brand-primary-dark"><Plus className="h-3.5 w-3.5" /> Add question</button>
                                </div>
                            </div>
                            </div>

                            <div className="shrink-0 flex justify-end gap-2 px-6 py-4 border-t border-border-modal bg-surface-modal">
                                <button type="button" onClick={() => setShowFormModal(false)} className="px-4 py-2 rounded-xl text-xs font-bold ui-card-soft text-text-secondary">Cancel</button>
                                <button type="submit" disabled={savingForm || !formName.trim()} className="px-5 py-2 rounded-xl text-xs font-bold bg-brand-primary text-white hover:bg-brand-primary-dark disabled:opacity-60 inline-flex items-center gap-1.5">
                                    {savingForm ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Save Questionnaire'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Start-onboarding modal ─────────────────────────────────── */}
            {startRow && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setStartRow(null)}>
                    <div className="bg-surface-modal border border-border-modal rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
                        <h3 className="font-black text-text-primary">Start onboarding</h3>
                        <p className="text-xs text-text-secondary">Choose the onboarding questionnaire for <strong>{startRow.applicantName}</strong> ({startRow.jobTitle}).</p>
                        <select value={pickFormId} onChange={(e) => setPickFormId(e.target.value)} className="ui-input w-full text-sm">
                            <option value="">Select a questionnaire…</option>
                            {forms.map((f) => <option key={f._id} value={f._id}>{f.name}</option>)}
                        </select>
                        {forms.length === 0 && <p className="text-[11px] text-amber-500">No questionnaires yet — create one in the Questionnaires tab first.</p>}
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setStartRow(null)} className="px-4 py-2 rounded-xl text-xs font-bold ui-card-soft text-text-secondary">Cancel</button>
                            <button onClick={handleStartOnboarding} disabled={!pickFormId || starting} className="px-5 py-2 rounded-xl text-xs font-bold bg-brand-primary text-white hover:bg-brand-primary-dark disabled:opacity-60 inline-flex items-center gap-1.5">
                                {starting ? <><Loader2 className="h-4 w-4 animate-spin" /> Starting…</> : 'Start'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Answer editor modal ────────────────────────────────────── */}
            {editorId && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-surface-modal border border-border-modal rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border-modal">
                            <div>
                                <h3 className="font-black text-text-primary">{editorMeta.applicantName || 'Onboarding'}</h3>
                                <p className="text-[11px] text-text-muted">{editorMeta.jobTitle} · {editorForm.name}</p>
                            </div>
                            <div className="flex items-center gap-1">
                                <button onClick={handleExportPdf} disabled={editorLoading} className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-brand-primary/30 text-brand-primary hover:bg-brand-primary/10 transition-colors disabled:opacity-60">
                                    <Download className="h-3.5 w-3.5" /> PDF
                                </button>
                                <button onClick={() => setEditorId(null)} className="p-2 rounded-lg text-text-secondary hover:bg-white/[0.06]"><X className="h-4 w-4" /></button>
                            </div>
                        </div>
                        {editorLoading ? (
                            <div className="flex-1 flex justify-center items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-primary" /></div>
                        ) : (
                            <>
                                <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-5">
                                    {editorForm.customFields.length === 0 ? (
                                        <p className="text-sm text-text-muted italic">This questionnaire has no questions.</p>
                                    ) : editorForm.customFields.map((field) => (
                                        <div key={field.name} className="space-y-1.5">
                                            <label className="text-xs font-bold text-text-secondary">
                                                {field.label} {field.required && <span className="text-rose-500">*</span>}
                                            </label>
                                            {renderAnswerField(field)}
                                        </div>
                                    ))}
                                </div>
                                <div className="shrink-0 flex items-center justify-between gap-2 px-6 py-4 border-t border-border-modal bg-surface-modal">
                                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase ${STATUS_META[(editorMeta.status as OnboardingStatus)] ? STATUS_META[(editorMeta.status as OnboardingStatus)].cls : STATUS_META.in_progress.cls}`}>
                                        {STATUS_META[(editorMeta.status as OnboardingStatus)]?.label || 'In progress'}
                                    </span>
                                    <div className="flex gap-2">
                                        <button onClick={() => saveAnswers(false)} disabled={savingAnswers} className="px-4 py-2 rounded-xl text-xs font-bold ui-card-soft text-text-secondary disabled:opacity-60 inline-flex items-center gap-1.5">
                                            {savingAnswers ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
                                        </button>
                                        <button onClick={() => saveAnswers(true)} disabled={savingAnswers} className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-60 inline-flex items-center gap-1.5">
                                            <CheckCircle2 className="h-4 w-4" /> Mark completed
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ── File viewer ────────────────────────────────────────────── */}
            {viewerFile && (() => {
                const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(viewerFile.name || '');
                return (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" onClick={() => setViewerFile(null)}>
                        <div className="w-full max-w-4xl h-[85vh] rounded-2xl border border-border-modal bg-surface-modal shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border-modal">
                                <div className="flex items-center gap-2 min-w-0"><FileText className="h-4 w-4 text-brand-primary shrink-0" /><p className="text-sm font-bold text-text-primary truncate">{viewerFile.name}</p></div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <a href={viewerFile.url} download className="p-2 rounded-lg text-text-secondary hover:bg-white/[0.06]" title="Download"><Download className="h-4 w-4" /></a>
                                    <button onClick={() => setViewerFile(null)} className="p-2 rounded-lg text-text-secondary hover:bg-white/[0.06]"><X className="h-4 w-4" /></button>
                                </div>
                            </div>
                            <div className="flex-1 bg-slate-100 dark:bg-black/40 overflow-auto flex items-center justify-center">
                                {isImage ? <img src={viewerFile.url} alt={viewerFile.name} className="max-w-full max-h-full object-contain" /> : <iframe src={viewerFile.url} title={viewerFile.name} className="w-full h-full border-0" />}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ── Alert ──────────────────────────────────────────────────── */}
            {alert && (
                <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setAlert(null)}>
                    <div className="bg-surface-modal border border-border-modal rounded-2xl w-full max-w-sm p-6 text-center space-y-3" onClick={(e) => e.stopPropagation()}>
                        <h3 className="font-bold text-text-primary">{alert.title}</h3>
                        <p className="text-xs text-text-secondary">{alert.message}</p>
                        <button onClick={() => setAlert(null)} className="w-full bg-brand-primary text-white font-bold text-xs py-2.5 rounded-xl">Dismiss</button>
                    </div>
                </div>
            )}
        </div>
    );
}
