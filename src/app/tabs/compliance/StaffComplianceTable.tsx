"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  Eye,
  EyeOff,
  FileText,
  CalendarClock,
  ChevronRight as ArrowIn,
  Check,
  ShieldX,
  Upload,
  Save,
  Plus,
  Trash2,
} from "lucide-react";
import {
  type ComplianceSummary,
  type ComplianceCard,
  overallStatus,
  OVERALL_META,
  statusBadgeClass,
} from "./shared";
import {
  useGetComplianceStaffQuery,
  useGetStaffComplianceQuery,
  useGetRequirementsQuery,
  useStaffComplianceActionMutation,
} from "@/lib/features/api/complianceApi";
import { sanitizeMetadataValue, metadataValueError, metadataInputProps } from "@/lib/documentMetadata";

interface StaffRow {
  staffId: string;
  name: string;
  email: string;
  role: string;
  summary: ComplianceSummary;
}

export function StaffComplianceTable({ initialStaffId }: { initialStaffId?: string }) {
  // A deep-link (?staff=<id>) pre-filters the table to that staff instead of
  // force-opening a blocking modal. The row shows their real name; the admin
  // clicks in when they want the detail.
  const [search, setSearch] = useState(initialStaffId || "");
  const [debouncedSearch, setDebouncedSearch] = useState(initialStaffId || "");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<StaffRow | null>(null);

  // Debounced search; resets to page 1 on query change.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // RTK Query — cached by (search, page), so paging back to a prior page (or
  // reopening the tab) serves from cache. Compliance writes invalidate the list.
  const { data, isFetching, error: queryError } = useGetComplianceStaffQuery({
    search: debouncedSearch,
    page,
    limit: 20,
  });
  const rows: StaffRow[] = Array.isArray(data?.staff) ? data.staff : [];
  const totalPages: number = data?.totalPages || 1;
  const total: number = data?.total || 0;
  const loading = isFetching;
  const error = queryError ? "Failed to load staff compliance." : "";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search staff by name, email, or ID"
            className="ui-input pl-9"
          />
        </div>
        <span className="text-xs text-text-muted">{total} staff</span>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-400">
          {error}
        </div>
      )}

      <div className="crm-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-text-muted border-b border-border-card">
                <th className="px-4 py-3">Staff</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 hidden md:table-cell">Breakdown</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <Loader2 className="h-7 w-7 animate-spin text-brand-primary mx-auto" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-text-secondary">
                    No staff match this search.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const overall = overallStatus(row.summary);
                  const meta = OVERALL_META[overall];
                  return (
                    <tr
                      key={row.staffId}
                      onClick={() => setSelected(row)}
                      className="border-b border-border-card/60 last:border-0 hover:bg-white/[0.02] cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-bold text-text-primary">{row.name}</div>
                        <div className="text-xs text-text-muted break-all">{row.email || "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{row.role || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${meta.className}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
                          <span className="text-emerald-400">{row.summary.verified}✓</span>
                          <span className="text-amber-400">{row.summary.pending} pend</span>
                          <span className="text-rose-400">{row.summary.expired} exp</span>
                          <span className="text-text-muted">{row.summary.missing} miss</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ArrowIn className="h-4 w-4 text-text-muted inline" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="p-2 rounded-lg ui-card-soft disabled:opacity-40 hover:text-brand-primary"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs text-text-secondary">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="p-2 rounded-lg ui-card-soft disabled:opacity-40 hover:text-brand-primary"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {selected && <StaffComplianceDetail row={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

interface CatalogItem {
  key: string;
  label: string;
  active: boolean;
}

function StaffComplianceDetail({ row, onClose }: { row: StaffRow; onClose: () => void }) {
  const name = row.name;
  const [localError, setLocalError] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [expiryDrafts, setExpiryDrafts] = useState<Record<string, string>>({});
  const [metadataDrafts, setMetadataDrafts] = useState<Record<string, string>>({}); // reference value
  const [assignKey, setAssignKey] = useState("");
  const [rejectTarget, setRejectTarget] = useState<string | null>(null); // requirementKey being rejected
  const [rejectReason, setRejectReason] = useState("");

  // Cards for this staff member — cached per staffId; a write invalidates this
  // exact entry so it refetches, while other staff stay cached.
  const { data: detail, isLoading: loading, error: detailError } = useGetStaffComplianceQuery(row.staffId);
  const cards: ComplianceCard[] = useMemo(() => (Array.isArray(detail?.cards) ? detail.cards : []), [detail]);
  const summary: ComplianceSummary | null = detail?.summary ?? null;
  const error = localError || (detailError ? "Failed to load." : "");
  const setError = setLocalError;

  const [runAction] = useStaffComplianceActionMutation();

  // Catalog for the "assign requirement" picker — shared cache with the
  // Requirements tab, so this is usually a cache hit (no extra request).
  const { data: reqData } = useGetRequirementsQuery();
  const catalog: CatalogItem[] = Array.isArray(reqData?.requirements) ? reqData.requirements : [];

  // Seed expiry + metadata inputs whenever the cards change (load + after a write).
  useEffect(() => {
    setExpiryDrafts(
      Object.fromEntries(cards.map((c) => [c.requirementKey, c.expiryDate ? c.expiryDate.split("T")[0] : ""]))
    );
    setMetadataDrafts(
      Object.fromEntries(cards.map((c) => [c.requirementKey, (c.evidence?.reference ?? "") as string]))
    );
  }, [cards]);

  const doAction = async (key: string, action: string, extra: Record<string, any> = {}) => {
    setBusyKey(key);
    setError("");
    try {
      // Mutation invalidates this staff's detail + the list + overview, so the
      // cards refetch automatically — no manual reload.
      await runAction({ staffId: row.staffId, requirementKey: key, body: { action, ...extra } }).unwrap();
    } catch (err: any) {
      setError(err?.data?.error || err?.message || "Action failed.");
    } finally {
      setBusyKey(null);
    }
  };

  const submitReject = () => {
    if (!rejectTarget) return;
    const key = rejectTarget;
    const reason = rejectReason.trim();
    setRejectTarget(null);
    setRejectReason("");
    doAction(key, "reject", { reason });
  };

  const uploadEvidence = async (key: string, file: File | null) => {
    if (!file) return;
    setBusyKey(key);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("source", "admin");
      fd.append("usageType", "supporting_document");
      const up = await fetch("/api/upload", { method: "POST", body: fd });
      const upData = await up.json();
      if (!up.ok) throw new Error(upData.error || "Upload failed.");
      await doAction(key, "add_evidence", {
        evidence: { fileUrl: upData.url, fileName: file.name, publicId: upData.public_id },
      });
    } catch (err: any) {
      setError(err?.message || "Upload failed.");
      setBusyKey(null);
    }
  };

  const shownKeys = new Set(cards.map((c) => c.requirementKey));
  const assignable = catalog.filter((c) => c.active && !shownKeys.has(c.key));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="crm-panel w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-text-muted">Compliance detail</p>
            <h3 className="mt-1 text-xl font-black text-text-primary">{name}</h3>
            <p className="text-xs text-text-muted break-all">{row.email || row.staffId}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg ui-card-soft hover:text-rose-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        {summary && (
          <div className="flex flex-wrap gap-2 text-[11px] font-bold">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">Verified {summary.verified}</span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">Pending {summary.pending}</span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">Expired {summary.expired}</span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-border-card text-text-muted">Missing {summary.missing}</span>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">{error}</div>
        )}

        {/* Attach a requirement to this staff member (beyond role/position targeting) */}
        <div className="rounded-2xl border border-border-card bg-surface-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-text-muted" />
            <p className="text-sm font-black text-text-primary">Attach a requirement to this staff member</p>
          </div>
          {assignable.length > 0 ? (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <select value={assignKey} onChange={(e) => setAssignKey(e.target.value)} className="ui-input flex-1">
                <option value="">Select a requirement…</option>
                {assignable.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!assignKey || busyKey === assignKey}
                onClick={() => { const k = assignKey; setAssignKey(""); doAction(k, "assign"); }}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-primary hover:bg-brand-primary-dark disabled:opacity-50 text-white text-sm font-bold px-4 py-2.5 transition-colors shrink-0"
              >
                <Plus className="h-4 w-4" /> Attach
              </button>
            </div>
          ) : (
            <p className="text-xs text-text-muted">Every active requirement is already shown for this staff member.</p>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {cards.map((card) => {
              const busy = busyKey === card.requirementKey;
              return (
                <div key={card.requirementKey} className="ui-card rounded-3xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="text-sm font-black text-text-primary break-words">{card.label}</h4>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {card.isMandatory && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold ui-card-soft ui-muted">MANDATORY</span>
                        )}
                        {card.evidenceMode === "metadata_only" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                            <EyeOff className="h-3 w-3" /> METADATA
                          </span>
                        )}
                        {card.assignedManually && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-violet-500/10 text-violet-400 border border-violet-500/20">MANUAL</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {busy && <Loader2 className="h-4 w-4 animate-spin text-brand-primary" />}
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statusBadgeClass(card.status)}`}>
                        {card.status.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {card.rejectionReason && (
                    <p className="text-xs text-rose-400">Rejected: {card.rejectionReason}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Evidence link/state */}
                    {card.evidence?.fileUrl ? (
                      // Route through the admin file proxy so private (authenticated)
                      // assets are signed server-side; public assets pass through.
                      <a href={`/api/admin/file?src=${encodeURIComponent(card.evidence.fileUrl)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-brand-primary hover:text-brand-primary-dark">
                        <Eye className="h-3.5 w-3.5" /> Evidence
                      </a>
                    ) : card.evidence?.reference ? (
                      <span className="text-xs text-text-secondary inline-flex items-center gap-1">
                        <FileText className="h-3 w-3" /> Recorded: <span className="font-bold text-text-primary">{card.evidence.reference}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-text-muted inline-flex items-center gap-1"><FileText className="h-3 w-3" /> No evidence</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border-card/60">
                    <button type="button" disabled={busy} onClick={() => doAction(card.requirementKey, "verify")} className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold px-2.5 py-1.5 disabled:opacity-50">
                      <Check className="h-3.5 w-3.5" /> Verify
                    </button>
                    <button type="button" disabled={busy} onClick={() => { setRejectTarget(card.requirementKey); setRejectReason(""); }} className="inline-flex items-center gap-1 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-bold px-2.5 py-1.5 disabled:opacity-50">
                      <ShieldX className="h-3.5 w-3.5" /> Reject
                    </button>

                    {card.evidenceMode === "metadata_only" ? (
                      <span className="inline-flex items-center gap-1">
                        <input
                          type="text"
                          value={metadataDrafts[card.requirementKey] ?? ""}
                          onChange={(e) => setMetadataDrafts((p) => ({ ...p, [card.requirementKey]: sanitizeMetadataValue(card.requirementKey, e.target.value) }))}
                          placeholder={metadataInputProps(card.requirementKey).placeholder || "Reference / value (no file stored)"}
                          inputMode={metadataInputProps(card.requirementKey).inputMode}
                          maxLength={metadataInputProps(card.requirementKey).maxLength}
                          className="ui-input w-56 py-1"
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            const val = (metadataDrafts[card.requirementKey] || "").trim();
                            const fmtError = metadataValueError(card.requirementKey, val);
                            if (fmtError) { setError(fmtError); return; }
                            doAction(card.requirementKey, "add_evidence", {
                              evidence: {
                                reference: val,
                                deliveryMethod: "manual",
                                source: "admin_metadata_record",
                              },
                            });
                          }}
                          className="inline-flex items-center gap-1 rounded-lg ui-card-soft text-xs font-bold px-2.5 py-1.5 disabled:opacity-50"
                          title="Record this reference (no file is stored)"
                        >
                          <Check className="h-3.5 w-3.5" /> Record
                        </button>
                      </span>
                    ) : (
                      <label className="inline-flex items-center gap-1 rounded-lg ui-card-soft text-xs font-bold px-2.5 py-1.5 cursor-pointer">
                        <Upload className="h-3.5 w-3.5" /> Evidence
                        <input type="file" className="hidden" disabled={busy} onChange={(e) => uploadEvidence(card.requirementKey, e.target.files?.[0] || null)} />
                      </label>
                    )}

                    {card.requiresExpiry && (
                      <span className="inline-flex items-center gap-1 text-xs">
                        <CalendarClock className="h-3.5 w-3.5 text-text-muted" />
                        <input
                          type="date"
                          value={expiryDrafts[card.requirementKey] || ""}
                          onChange={(e) => setExpiryDrafts((p) => ({ ...p, [card.requirementKey]: e.target.value }))}
                          className="ui-input w-[9.5rem] py-1"
                        />
                        <button type="button" disabled={busy} onClick={() => doAction(card.requirementKey, "set_expiry", { expiryDate: expiryDrafts[card.requirementKey] || null })} className="inline-flex items-center gap-1 rounded-lg ui-card-soft text-xs font-bold px-2 py-1.5 disabled:opacity-50" title="Save expiry">
                          <Save className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    )}

                    {card.assignedManually ? (
                      // Manually-attached → a real delete (it won't re-appear).
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (confirm(`Delete "${card.label}" from this staff member? Any recorded value is removed. Their submitted document (if any) stays on their application.`)) {
                            doAction(card.requirementKey, "unassign");
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-lg text-text-muted hover:text-rose-400 text-xs font-bold px-2 py-1.5 disabled:opacity-50 ml-auto"
                        title="Delete this requirement from this staff member"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    ) : (
                      // Mandatory/catalog → exempt (a delete would just re-derive it).
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (confirm(`Exempt this staff member from "${card.label}"? It will be hidden and no longer counted for them only (not for others). To retire it for everyone, deactivate it in Requirements.`)) {
                            doAction(card.requirementKey, "exempt");
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-lg text-text-muted hover:text-amber-400 text-xs font-bold px-2 py-1.5 disabled:opacity-50 ml-auto"
                        title="Exempt this staff member from this requirement"
                      >
                        <EyeOff className="h-3.5 w-3.5" /> Exempt
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {rejectTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setRejectTarget(null)}>
          <div className="crm-panel w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                <ShieldX className="h-5 w-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-black text-text-primary">Reject this document?</h3>
                <p className="mt-1 text-sm text-text-secondary">Add a reason — the staff member will see it.</p>
              </div>
            </div>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Reason for rejection (optional)"
              className="ui-input resize-none w-full"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setRejectTarget(null)} className="rounded-xl ui-card-soft px-4 py-2.5 text-sm font-bold text-text-secondary hover:text-text-primary">
                Cancel
              </button>
              <button type="button" onClick={submitReject} className="inline-flex items-center gap-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold px-5 py-2.5 transition-colors">
                <ShieldX className="h-4 w-4" /> Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
