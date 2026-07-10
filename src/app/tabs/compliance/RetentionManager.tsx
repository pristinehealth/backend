"use client";

import { useState } from "react";
import {
  Archive,
  Trash2,
  Loader2,
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Clock,
  RefreshCw,
} from "lucide-react";
import { useGetRetentionQuery, useDisposeComplianceMutation } from "@/lib/features/api/complianceApi";

type RetentionState = "held" | "pending" | "due" | "protected";

interface RetentionItem {
  type: "record";
  key: string;
  label: string;
  archivedAt: string;
  retentionDays: number | null;
  disposeAt: string | null;
  state: RetentionState;
  hasFile: boolean;
}

interface RetentionStaff {
  staffId: string;
  staffEmail: string;
  stillActive: boolean;
  earliestArchivedAt: string | null;
  counts: { held: number; pending: number; due: number; protected: number };
  items: RetentionItem[];
}

interface Overview {
  summary: {
    archivedStaff: number;
    archivedRecords: number;
    held: number;
    pending: number;
    due: number;
    protected: number;
  };
  staff: RetentionStaff[];
}

const STATE_META: Record<RetentionState, { label: string; className: string }> = {
  held: { label: "Held (indefinite)", className: "ui-card-soft ui-muted" },
  pending: { label: "Pending", className: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  due: { label: "Due for disposal", className: "bg-rose-500/10 text-rose-400 border-rose-500/20" },
  protected: { label: "Protected (returned)", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
};

export function RetentionManager() {
  const { data: retentionData, isLoading: loading, error: queryError, refetch } = useGetRetentionQuery();
  const data: Overview | null = retentionData
    ? { summary: retentionData.summary, staff: retentionData.staff }
    : null;
  const [disposeCompliance] = useDisposeComplianceMutation();

  const [localError, setLocalError] = useState("");
  const error = localError || (queryError ? "Failed to load retention state." : "");
  const setError = setLocalError;
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [confirmCleanup, setConfirmCleanup] = useState<{ staffId?: string; force?: boolean } | null>(null);

  const flash = (t: string) => {
    setMessage(t);
    setTimeout(() => setMessage(""), 4000);
  };

  const runPreview = async () => {
    setBusy("preview");
    setError("");
    try {
      const d = await disposeCompliance({ dryRun: true }).unwrap();
      setPreview(d);
    } catch (err: any) {
      setError(err?.data?.error || err?.message || "Preview failed.");
    } finally {
      setBusy(null);
    }
  };

  const confirmCleanupRun = async () => {
    const staffId = confirmCleanup?.staffId;
    const force = confirmCleanup?.force;
    setConfirmCleanup(null);
    setBusy(staffId || "all");
    setError("");
    try {
      const d = await disposeCompliance({ dryRun: false, ...(staffId ? { staffId } : {}), ...(force ? { force: true } : {}) }).unwrap();
      flash(`Disposed ${d.recordsDisposed} record(s), ${d.filesDeleted} file(s).`);
      setPreview(null);
    } catch (err: any) {
      setError(err?.data?.error || err?.message || "Cleanup failed.");
    } finally {
      setBusy(null);
    }
  };

  const s = data?.summary;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-primary-muted text-brand-primary border border-brand-primary/20 text-xs font-bold uppercase tracking-widest">
            <Archive className="h-3.5 w-3.5" /> Retention & disposal
          </div>
          <p className="mt-3 text-sm text-text-secondary max-w-2xl">
            Terminated staff whose compliance data is archived. Nothing is deleted until its retention window elapses
            (set per requirement). Preview before you clean.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => refetch()} className="inline-flex items-center gap-1.5 rounded-xl ui-card-soft px-3 py-2 text-xs font-bold text-text-secondary hover:text-text-primary">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button type="button" onClick={runPreview} disabled={busy === "preview"} className="inline-flex items-center gap-1.5 rounded-xl ui-card-soft px-3 py-2 text-xs font-bold text-text-secondary hover:text-text-primary disabled:opacity-50">
            {busy === "preview" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />} Preview cleanup
          </button>
          <button
            type="button"
            onClick={() => setConfirmCleanup({})}
            disabled={busy === "all" || !s || s.due === 0}
            title={s && s.due === 0 ? "Nothing is due for disposal" : "Dispose all due data"}
            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500/90 hover:bg-rose-500 text-white px-3 py-2 text-xs font-bold disabled:opacity-40"
          >
            {busy === "all" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Run cleanup ({s?.due ?? 0} due)
          </button>
        </div>
      </div>

      {message && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-400 inline-flex items-center gap-2">
          <Check className="h-4 w-4" /> {message}
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-400 inline-flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Summary */}
      {s && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {[
            { label: "Archived staff", value: s.archivedStaff, cls: "text-text-primary" },
            { label: "Records", value: s.archivedRecords, cls: "text-text-primary" },
            { label: "Held", value: s.held, cls: "text-text-muted" },
            { label: "Pending", value: s.pending, cls: "text-amber-400" },
            { label: "Due", value: s.due, cls: "text-rose-400" },
            { label: "Protected", value: s.protected, cls: "text-emerald-400" },
          ].map((c) => (
            <div key={c.label} className="ui-card-soft rounded-2xl p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{c.label}</p>
              <p className={`mt-1 text-2xl font-black ${c.cls}`}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Preview result */}
      {preview && (
        <div className="rounded-2xl border border-border-card ui-card-soft p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-text-primary">Dry-run preview — would dispose {preview.recordsDisposed} record(s), {preview.filesDeleted} file(s)</p>
            <button type="button" onClick={() => setPreview(null)} className="text-xs text-text-muted hover:text-text-secondary">dismiss</button>
          </div>
          {Array.isArray(preview.items) && preview.items.length > 0 && (
            <div className="max-h-40 overflow-y-auto text-xs text-text-secondary font-mono">
              {preview.items.map((it: any, i: number) => (
                <div key={i}>{it.type} · {it.staffId} · {it.key} · dispose {new Date(it.disposeAt).toLocaleDateString()}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Archived staff */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-text-secondary">
          <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
        </div>
      ) : !data || data.staff.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-card bg-surface-card p-8 text-sm text-text-secondary text-center">
          No archived (terminated) staff. Compliance data is archived automatically when a staff member is removed from Perfex.
        </div>
      ) : (
        <div className="space-y-3">
          {data.staff.map((st) => {
            const open = !!expanded[st.staffId];
            return (
              <div key={st.staffId} className="crm-panel p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <button type="button" onClick={() => setExpanded((p) => ({ ...p, [st.staffId]: !open }))} className="flex items-start gap-2 min-w-0 text-left">
                    {open ? <ChevronDown className="h-4 w-4 mt-0.5 text-text-muted shrink-0" /> : <ChevronRight className="h-4 w-4 mt-0.5 text-text-muted shrink-0" />}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-text-primary break-all">{st.staffEmail || st.staffId}</span>
                        {st.stillActive && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <ShieldCheck className="h-3 w-3" /> RETURNED TO PERFEX
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-text-muted mt-0.5">
                        ID {st.staffId} · archived {st.earliestArchivedAt ? new Date(st.earliestArchivedAt).toLocaleDateString() : "—"} · {st.items.length} item(s)
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="hidden sm:flex flex-wrap gap-1 text-[10px] font-bold">
                      {st.counts.due > 0 && <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">{st.counts.due} due</span>}
                      {st.counts.pending > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">{st.counts.pending} pending</span>}
                      {st.counts.held > 0 && <span className="px-2 py-0.5 rounded-full ui-card-soft ui-muted">{st.counts.held} held</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => setConfirmCleanup({ staffId: st.staffId, force: true })}
                      disabled={busy === st.staffId}
                      title="Permanently dispose ALL of this staff member's compliance data, ignoring retention"
                      className="inline-flex items-center gap-1 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-bold px-2.5 py-1.5 disabled:opacity-40"
                    >
                      {busy === st.staffId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Clean
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {st.items.map((it, i) => {
                      const meta = STATE_META[it.state];
                      return (
                        <div key={i} className="ui-card-soft rounded-xl p-3 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-text-primary break-words">{it.label}</p>
                            <p className="text-[10px] text-text-muted">
                              record
                              {it.hasFile ? " · file" : ""}
                              {it.disposeAt ? ` · dispose ${new Date(it.disposeAt).toLocaleDateString()}` : it.retentionDays == null ? " · no retention set" : ""}
                            </p>
                          </div>
                          <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border ${meta.className}`}>
                            {meta.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {confirmCleanup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setConfirmCleanup(null)}
        >
          <div className="crm-panel w-full max-w-md p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                <Trash2 className="h-5 w-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-black text-text-primary">
                  {confirmCleanup.force
                    ? "Force-dispose all of this staff member’s data?"
                    : "Permanently dispose ALL due data?"}
                </h3>
                <p className="mt-1 text-sm text-text-secondary">
                  {confirmCleanup.force
                    ? "This deletes EVERY archived compliance record, document, and file for this terminated staff member — including items with no retention set or whose window hasn’t elapsed. This cannot be undone."
                    : "This deletes the due-for-disposal compliance records, documents, and their files. This cannot be undone."}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmCleanup(null)}
                className="rounded-xl ui-card-soft px-4 py-2.5 text-sm font-bold text-text-secondary hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmCleanupRun}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold px-5 py-2.5 transition-colors"
              >
                <Trash2 className="h-4 w-4" /> Dispose
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
