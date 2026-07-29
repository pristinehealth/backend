"use client";

import { Loader2, AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: 'danger' | 'default';
    busy?: boolean;
    onConfirm: () => void;
    onClose: () => void;
}

// App-styled confirmation dialog (replaces native window.confirm). Renders above
// other modals (z-[60]). Matches the inline confirm modals used elsewhere
// (RetentionManager cleanup, RequirementsManager delete).
export function ConfirmDialog({
    open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
    tone = 'default', busy = false, onConfirm, onClose,
}: ConfirmDialogProps) {
    if (!open) return null;
    const danger = tone === 'danger';
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={busy ? undefined : onClose}>
            <div className="bg-surface-modal border border-border-modal rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start gap-3">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${danger ? 'bg-rose-500/10 border border-rose-500/20' : 'bg-brand-primary-muted border border-brand-primary/20'}`}>
                        <AlertTriangle className={`h-5 w-5 ${danger ? 'text-rose-500' : 'text-brand-primary'}`} />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-base font-black text-text-primary">{title}</h3>
                        {message && <p className="mt-1 text-sm text-text-secondary">{message}</p>}
                    </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                    <button type="button" onClick={onClose} disabled={busy} className="rounded-xl ui-card-soft px-4 py-2.5 text-sm font-bold text-text-secondary hover:text-text-primary disabled:opacity-60">
                        {cancelLabel}
                    </button>
                    <button type="button" onClick={onConfirm} disabled={busy} className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60 transition-colors ${danger ? 'bg-rose-500 hover:bg-rose-600' : 'bg-brand-primary hover:bg-brand-primary-dark'}`}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
