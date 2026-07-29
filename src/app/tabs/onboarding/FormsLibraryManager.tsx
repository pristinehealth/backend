"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, Trash2, Upload, FileText, ToggleLeft, ToggleRight } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface LibraryForm {
    _id: string;
    title: string;
    description?: string;
    category?: string;
    fileName?: string;
    active: boolean;
    order: number;
}

// Admin manager for the global downloadable-forms library (W-2, W-4, I-9, …).
// Replacing a form's file updates it in place, so applicants always get the
// latest version.
export function FormsLibraryManager() {
    const [forms, setForms] = useState<LibraryForm[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [pendingFile, setPendingFile] = useState<{ publicId: string; url: string; fileName: string } | null>(null);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<LibraryForm | null>(null);
    const fileRef = useRef<HTMLInputElement | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/forms-library');
            const data = await res.json();
            setForms(Array.isArray(data?.data) ? data.data : []);
        } catch {
            setError('Failed to load forms.');
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { void load(); }, []);

    // Admin uploads return a URL directly (source 'admin').
    const upload = async (file: File): Promise<{ url: string; fileName: string } | null> => {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('source', 'admin');
        fd.append('usageType', 'supporting_document');
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok || !data?.url) { setError(data?.error || 'Upload failed.'); return null; }
        return { url: data.url, fileName: file.name };
    };

    const onPickNew = async (file: File | null) => {
        if (!file) return;
        setUploading(true); setError('');
        try {
            const up = await upload(file);
            if (up) setPendingFile({ publicId: '', url: up.url, fileName: up.fileName });
        } finally {
            setUploading(false);
        }
    };

    const add = async () => {
        if (!title.trim() || !pendingFile) { setError('A title and a file are required.'); return; }
        setSaving(true); setError('');
        try {
            const res = await fetch('/api/admin/forms-library', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: title.trim(), description: description.trim(), fileUrl: pendingFile.url, fileName: pendingFile.fileName }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data?.error || 'Failed to add form.'); return; }
            setTitle(''); setDescription(''); setPendingFile(null);
            if (fileRef.current) fileRef.current.value = '';
            await load();
        } finally {
            setSaving(false);
        }
    };

    const patch = async (id: string, body: any) => {
        setBusyId(id);
        try {
            const res = await fetch(`/api/admin/forms-library/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (res.ok) await load();
        } finally {
            setBusyId(null);
        }
    };

    const replaceFile = async (id: string, file: File | null) => {
        if (!file) return;
        setBusyId(id);
        try {
            const up = await upload(file);
            if (up) await patch(id, { fileUrl: up.url, fileName: up.fileName });
        } finally {
            setBusyId(null);
        }
    };

    const remove = async (id: string) => {
        setBusyId(id);
        try {
            const res = await fetch(`/api/admin/forms-library/${id}`, { method: 'DELETE' });
            if (res.ok) await load();
        } finally {
            setBusyId(null);
            setConfirmDelete(null);
        }
    };

    return (
        <div className="space-y-5">
            <div>
                <h3 className="text-sm font-black tracking-wide text-text-primary">Downloadable Forms</h3>
                <p className="text-xs text-text-muted mt-1">Blank forms (W-2, W-4, I-9, …) applicants can download. Replacing a file updates it everywhere.</p>
            </div>

            {error && <div className="p-3 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-500 text-sm">{error}</div>}

            {/* Add new */}
            <div className="crm-panel rounded-2xl p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Form title (e.g. W-2)" className="ui-input text-sm" />
                    <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" className="ui-input text-sm" />
                </div>
                <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-xl ui-card-soft text-text-secondary cursor-pointer">
                        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {pendingFile ? 'Change file' : 'Choose file'}
                        <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt" onChange={(e) => { void onPickNew(e.target.files?.[0] || null); }} />
                    </label>
                    {pendingFile && <span className="text-xs text-text-muted truncate">{pendingFile.fileName}</span>}
                    <button onClick={add} disabled={saving || !title.trim() || !pendingFile} className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl bg-brand-primary text-white hover:bg-brand-primary-dark disabled:opacity-50">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add form
                    </button>
                </div>
            </div>

            {/* List */}
            {loading ? (
                <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-brand-primary" /></div>
            ) : forms.length === 0 ? (
                <div className="crm-panel rounded-2xl p-8 text-center text-sm text-text-muted">No downloadable forms yet.</div>
            ) : (
                <div className="space-y-2">
                    {forms.map((f) => (
                        <div key={f._id} className={`crm-panel rounded-2xl p-4 flex items-center gap-3 ${f.active ? '' : 'opacity-60'}`}>
                            <FileText className="h-5 w-5 text-brand-primary shrink-0" />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-text-primary truncate">{f.title}</p>
                                <p className="text-[11px] text-text-muted truncate">{f.fileName}{f.description ? ` · ${f.description}` : ''}</p>
                            </div>
                            <button onClick={() => patch(f._id, { active: !f.active })} disabled={busyId === f._id} title={f.active ? 'Active' : 'Inactive'} className={`shrink-0 ${f.active ? 'text-emerald-500' : 'text-text-muted'}`}>
                                {f.active ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                            </button>
                            <label className="shrink-0 text-xs font-bold text-brand-primary cursor-pointer">Replace<input type="file" className="hidden" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt" onChange={(e) => { void replaceFile(f._id, e.target.files?.[0] || null); }} /></label>
                            <button onClick={() => setConfirmDelete(f)} disabled={busyId === f._id} className="shrink-0 text-rose-500 hover:text-rose-400 disabled:opacity-50">
                                {busyId === f._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <ConfirmDialog
                open={!!confirmDelete}
                tone="danger"
                title="Delete form?"
                message={confirmDelete ? `Remove "${confirmDelete.title}" from the library? Applicants will no longer see it.` : ''}
                confirmLabel="Delete"
                busy={!!confirmDelete && busyId === confirmDelete._id}
                onConfirm={() => confirmDelete && remove(confirmDelete._id)}
                onClose={() => setConfirmDelete(null)}
            />
        </div>
    );
}
