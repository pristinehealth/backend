"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

interface Props {
    open: boolean;
    initialValue: string;
    questionLabel?: string;
    onSave: (value: string) => void;
    onClose: () => void;
}

// Larger editing surface for a question's optional help text. Opened from the
// form builders (application + onboarding) so admins aren't cramped into a tiny
// inline input. z-[70] sits above the builder modal (z-50).
export function DescriptionEditorModal({ open, initialValue, questionLabel, onSave, onClose }: Props) {
    const [value, setValue] = useState(initialValue);

    // Reseed the textarea whenever a different question is opened.
    useEffect(() => { if (open) setValue(initialValue); }, [open, initialValue]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-surface-modal border border-border-modal rounded-2xl w-full max-w-xl shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border-modal">
                    <div className="min-w-0">
                        <h3 className="font-black text-text-primary">Question description</h3>
                        {questionLabel && <p className="text-[11px] text-text-muted truncate max-w-[380px]">{questionLabel}</p>}
                    </div>
                    <button type="button" onClick={onClose} className="p-2 rounded-lg text-text-secondary hover:bg-white/[0.06]"><X className="h-4 w-4" /></button>
                </div>

                <div className="p-6 space-y-2">
                    <p className="text-[11px] text-text-muted">Optional help text shown right above the question. Line breaks are preserved. Leave blank to hide it.</p>
                    <textarea
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        rows={9}
                        autoFocus
                        placeholder="e.g. Enter the number exactly as it appears on your license. If you don't have one yet, write “pending”."
                        className="ui-input w-full text-sm resize-y min-h-[180px]"
                    />
                </div>

                <div className="shrink-0 flex items-center justify-end gap-2 px-6 py-4 border-t border-border-modal bg-surface-modal">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold ui-card-soft text-text-secondary">Cancel</button>
                    <button type="button" onClick={() => { onSave(value); onClose(); }} className="px-5 py-2 rounded-xl text-xs font-bold bg-brand-primary text-white hover:bg-brand-primary-dark">Save description</button>
                </div>
            </div>
        </div>
    );
}
