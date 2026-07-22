"use client";

import { useEffect, useState } from "react";
import {
  ShieldCheck,
  Plus,
  Loader2,
  Edit,
  Trash2,
  X,
  CalendarClock,
  FileText,
  EyeOff,
  Check,
  AlertCircle,
} from "lucide-react";
import {
  useGetRequirementsQuery,
  useCreateRequirementMutation,
  useUpdateRequirementMutation,
  useDeleteRequirementMutation,
} from "@/lib/features/api/complianceApi";

type EvidenceMode = "file" | "metadata_only" | "either";

interface ComplianceRequirement {
  key: string;
  label: string;
  description?: string;
  appliesToAll: boolean;
  appliesToPositions: string[];
  collectAtApplication: boolean;
  evidenceMode: EvidenceMode;
  requiresExpiry: boolean;
  expiryCheckDays: number;
  isMandatory: boolean;
  active: boolean;
  retentionDays?: number | null;
  usageCount?: number;
}

interface Position {
  _id: string;
  title: string;
}

type Draft = {
  key: string;
  label: string;
  description: string;
  appliesToAll: boolean;
  appliesToPositions: string[]; // JobPosition ids
  collectAtApplication: boolean;
  evidenceMode: EvidenceMode;
  requiresExpiry: boolean;
  expiryCheckDays: number;
  isMandatory: boolean;
  active: boolean;
  retentionDays: string; // "" = indefinite / legal hold
};

const EMPTY_DRAFT: Draft = {
  key: "",
  label: "",
  description: "",
  appliesToAll: false,
  appliesToPositions: [],
  collectAtApplication: false,
  evidenceMode: "file",
  requiresExpiry: false,
  expiryCheckDays: 30,
  isMandatory: true,
  active: true,
  retentionDays: "",
};

const EVIDENCE_LABEL: Record<EvidenceMode, string> = {
  file: "File",
  metadata_only: "Metadata only",
  either: "File or metadata",
};

export function RequirementsManager() {
  const { data: reqData, isLoading: loading, error: queryError } = useGetRequirementsQuery();
  const requirements: ComplianceRequirement[] = Array.isArray(reqData?.requirements) ? reqData.requirements : [];
  const [createRequirement] = useCreateRequirementMutation();
  const [updateRequirement] = useUpdateRequirementMutation();
  const [deleteRequirement] = useDeleteRequirementMutation();

  const [localError, setLocalError] = useState("");
  const error = localError || (queryError ? "Failed to load requirements." : "");
  const setError = setLocalError;
  const [message, setMessage] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [isNew, setIsNew] = useState(true);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ComplianceRequirement | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);

  useEffect(() => {
    fetch("/api/admin/jobs?limit=0")
      .then((r) => r.json())
      .then((jobsData) => {
        const list = Array.isArray(jobsData) ? jobsData : Array.isArray(jobsData?.data) ? jobsData.data : [];
        setPositions(list.map((j: any) => ({ _id: String(j._id), title: j.title })));
      })
      .catch(() => {});
  }, []);

  const openCreate = () => {
    setIsNew(true);
    setDraft(EMPTY_DRAFT);
    setModalOpen(true);
  };

  const openEdit = (req: ComplianceRequirement) => {
    setIsNew(false);
    setDraft({
      key: req.key,
      label: req.label,
      description: req.description || "",
      appliesToAll: !!req.appliesToAll,
      appliesToPositions: req.appliesToPositions || [],
      collectAtApplication: !!req.collectAtApplication,
      evidenceMode: req.evidenceMode,
      requiresExpiry: req.requiresExpiry,
      expiryCheckDays: req.expiryCheckDays ?? 30,
      isMandatory: req.isMandatory,
      active: req.active,
      retentionDays: req.retentionDays == null ? "" : String(req.retentionDays),
    });
    setModalOpen(true);
  };

  const flash = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(""), 3500);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const payload = {
        label: draft.label,
        description: draft.description,
        appliesToAll: draft.appliesToAll,
        appliesToPositions: draft.appliesToPositions,
        collectAtApplication: draft.collectAtApplication,
        evidenceMode: draft.evidenceMode,
        requiresExpiry: draft.requiresExpiry,
        expiryCheckDays: Number(draft.expiryCheckDays) || 0,
        isMandatory: draft.isMandatory,
        active: draft.active,
        retentionDays: draft.retentionDays.trim() === "" ? null : Number(draft.retentionDays),
      };

      if (isNew) {
        await createRequirement({ ...payload, key: draft.key }).unwrap();
      } else {
        await updateRequirement({ key: draft.key, patch: payload }).unwrap();
      }

      setModalOpen(false);
      flash(isNew ? `Requirement "${draft.label}" created.` : `Requirement "${draft.label}" updated.`);
    } catch (err: any) {
      setError(err?.data?.error || err?.message || "Failed to save requirement.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (req: ComplianceRequirement) => {
    setBusyKey(req.key);
    setError("");
    try {
      await updateRequirement({ key: req.key, patch: { active: !req.active } }).unwrap();
    } catch (err: any) {
      setError(err?.data?.error || err?.message || "Failed to update.");
    } finally {
      setBusyKey(null);
    }
  };

  const confirmDelete = async () => {
    const req = confirmTarget;
    if (!req) return;
    setConfirmTarget(null);
    setBusyKey(req.key);
    setError("");
    try {
      await deleteRequirement(req.key).unwrap();
      flash(`Requirement "${req.label}" deleted.`);
    } catch (err: any) {
      setError(err?.data?.error || err?.message || "Failed to delete.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-primary-muted text-brand-primary border border-brand-primary/20 text-xs font-bold uppercase tracking-widest">
            <ShieldCheck className="h-3.5 w-3.5" /> Compliance requirements
          </div>
          <p className="mt-3 text-sm text-text-secondary max-w-2xl">
            The catalog of compliance obligations measured against every staff member. Defaults are
            seeded from the document policy; add or edit requirements here.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-primary hover:bg-brand-primary-dark text-white text-sm font-bold px-4 py-2.5 transition-all"
        >
          <Plus className="h-4 w-4" /> Add requirement
        </button>
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

      {loading ? (
        <div className="flex items-center justify-center py-16 text-text-secondary">
          <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
        </div>
      ) : requirements.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-card bg-surface-card p-8 text-sm text-text-secondary text-center">
          No compliance requirements yet. Click “Add requirement” to create one.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {requirements.map((req) => (
            <div key={req.key} className={`crm-panel p-5 space-y-4 ${req.active ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-black text-text-primary break-words">{req.label}</h3>
                  <p className="mt-0.5 text-[11px] font-mono text-text-muted break-all">{req.key}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEdit(req)}
                    className="p-2 rounded-lg ui-card-soft hover:text-brand-primary transition-colors"
                    title="Edit"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmTarget(req)}
                    disabled={busyKey === req.key}
                    className="p-2 rounded-lg ui-card-soft hover:text-rose-400 transition-colors disabled:opacity-50"
                    title="Delete"
                  >
                    {busyKey === req.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {req.description && <p className="text-xs text-text-secondary">{req.description}</p>}

              <div className="flex flex-wrap gap-1.5">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${req.isMandatory ? "bg-brand-primary-muted text-brand-primary border-brand-primary/20" : "ui-card-soft ui-muted"}`}>
                  {req.isMandatory ? "Mandatory" : "Optional"}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  {req.evidenceMode === "metadata_only" ? <EyeOff className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                  {EVIDENCE_LABEL[req.evidenceMode]}
                </span>
                {req.requiresExpiry && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <CalendarClock className="h-3 w-3" /> Expires · warn {req.expiryCheckDays}d
                  </span>
                )}
                {req.collectAtApplication && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    On application
                  </span>
                )}
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${req.retentionDays == null ? "ui-card-soft ui-muted" : "bg-rose-500/10 text-rose-400 border-rose-500/20"}`}>
                  {req.retentionDays == null ? "Retain: indefinite" : `Retain ${req.retentionDays}d`}
                </span>
                {typeof req.usageCount === "number" && req.usageCount > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ui-card-soft ui-muted">
                    {req.usageCount} record{req.usageCount === 1 ? "" : "s"}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-text-muted">
                  {req.appliesToAll
                    ? "Applies to all staff"
                    : req.appliesToPositions?.length
                      ? `${req.appliesToPositions.length} position(s)`
                      : "Not targeted — attach per staff"}
                </span>
                <button
                  type="button"
                  onClick={() => toggleActive(req)}
                  disabled={busyKey === req.key}
                  className={`font-bold transition-colors ${req.active ? "text-emerald-400 hover:text-emerald-300" : "text-text-muted hover:text-text-secondary"}`}
                >
                  {req.active ? "Active" : "Inactive"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="crm-panel w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-text-primary">
                {isNew ? "Add requirement" : `Edit: ${draft.label}`}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg ui-card-soft hover:text-rose-400">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <Field label="Key (unique, lowercase_snake)">
                <input
                  value={draft.key}
                  disabled={!isNew}
                  onChange={(e) => setDraft({ ...draft, key: e.target.value.toLowerCase() })}
                  placeholder="e.g. background_check"
                  className="ui-input disabled:opacity-60"
                />
                {!isNew && <p className="mt-1 text-[10px] text-text-muted">Key is immutable once created.</p>}
              </Field>

              <Field label="Label">
                <input
                  value={draft.label}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  placeholder="e.g. Background Check"
                  className="ui-input"
                />
              </Field>

              <Field label="Description">
                <textarea
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  rows={2}
                  className="ui-input resize-none"
                />
              </Field>

              <Field label="Evidence mode">
                <select
                  value={draft.evidenceMode}
                  onChange={(e) => setDraft({ ...draft, evidenceMode: e.target.value as EvidenceMode })}
                  disabled={!isNew}
                  className="ui-input disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="file">File (stored)</option>
                  <option value="metadata_only">Metadata only (sensitive — no file)</option>
                  <option value="either">Either</option>
                </select>
                {!isNew && (
                  <p className="mt-1 text-[10px] text-text-muted">
                    Locked after creation — changing it would strand uploaded files. Delete and recreate to change.
                  </p>
                )}
              </Field>

              <div className="rounded-xl ui-card-soft p-3">
                <label className="flex items-center gap-2 text-sm font-bold text-text-primary">
                  <input
                    type="checkbox"
                    checked={draft.appliesToAll}
                    onChange={(e) => setDraft({ ...draft, appliesToAll: e.target.checked })}
                  />
                  Applies to all staff
                </label>
                <p className="mt-1 text-[10px] text-text-muted">
                  Leave off to target specific roles/positions below. With nothing targeted, this requirement applies to
                  no one until you attach it to a staff member individually.
                </p>
              </div>

              {!draft.appliesToAll && (
              <Field label="Applies to positions">
                {positions.length === 0 ? (
                  <p className="text-xs text-text-muted">No job positions found.</p>
                ) : (
                  <div className="space-y-2">
                    {/* Selected positions as removable chips */}
                    {draft.appliesToPositions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {draft.appliesToPositions.map((id) => {
                          const p = positions.find((x) => x._id === id);
                          const label = p?.title || `Removed position · ${id.slice(-6)}`;
                          return (
                            <span
                              key={id}
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white ${p ? "bg-brand-primary" : "bg-slate-400 dark:bg-slate-600"}`}
                              title={p ? undefined : "This position no longer exists — remove it."}
                            >
                              {label}
                              <button
                                type="button"
                                aria-label={`Remove ${label}`}
                                onClick={() =>
                                  setDraft((d) => ({
                                    ...d,
                                    appliesToPositions: d.appliesToPositions.filter((x) => x !== id),
                                  }))
                                }
                                className="hover:opacity-80"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {/* Dropdown picker — choose a position to add it to the list */}
                    {(() => {
                      const available = positions.filter((p) => !draft.appliesToPositions.includes(p._id));
                      return (
                        <select
                          className="ui-input"
                          value=""
                          disabled={available.length === 0}
                          onChange={(e) => {
                            const id = e.target.value;
                            if (id) setDraft((d) => ({ ...d, appliesToPositions: [...d.appliesToPositions, id] }));
                          }}
                        >
                          <option value="">
                            {available.length ? "Select a position to add…" : "All positions selected"}
                          </option>
                          {available.map((p) => (
                            <option key={p._id} value={p._id}>{p.title}</option>
                          ))}
                        </select>
                      );
                    })()}
                    <p className="text-[10px] text-text-muted">
                      {draft.appliesToPositions.length} position(s) selected. Choose from the list to add more.
                    </p>
                  </div>
                )}
              </Field>
              )}

              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    checked={draft.collectAtApplication}
                    onChange={(e) => setDraft({ ...draft, collectAtApplication: e.target.checked })}
                  />
                  Collect on job application forms
                </label>
                <p className="text-[10px] text-text-muted leading-relaxed pl-6">
                  {draft.appliesToAll
                    ? "Applies to all staff is on — this document will be requested on every position's application form."
                    : draft.appliesToPositions.length
                      ? "Only requested on application forms for the positions you selected above — not every form."
                      : "No position is targeted above, so this won't appear on any form. Select a position first."}
                </p>
              </div>

              <Field label="Retention (days after termination; blank = indefinite / legal hold)">
                <input
                  type="number"
                  min={0}
                  value={draft.retentionDays}
                  onChange={(e) => setDraft({ ...draft, retentionDays: e.target.value })}
                  placeholder="e.g. 1095 for 3 years — confirm with counsel"
                  className="ui-input"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    checked={draft.isMandatory}
                    onChange={(e) => setDraft({ ...draft, isMandatory: e.target.checked })}
                  />
                  Mandatory
                </label>
                <label className="flex items-center gap-2 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    checked={draft.active}
                    onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                  />
                  Active
                </label>
                <label className="flex items-center gap-2 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    checked={draft.requiresExpiry}
                    onChange={(e) => setDraft({ ...draft, requiresExpiry: e.target.checked })}
                  />
                  Requires expiry
                </label>
                {draft.requiresExpiry && (
                  <label className="flex items-center gap-2 text-sm text-text-primary">
                    Warn (days)
                    <input
                      type="number"
                      min={0}
                      value={draft.expiryCheckDays}
                      onChange={(e) => setDraft({ ...draft, expiryCheckDays: Number(e.target.value) })}
                      className="ui-input w-20 py-1.5"
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-xl ui-card-soft px-4 py-2.5 text-sm font-bold text-text-secondary hover:text-text-primary">
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-primary hover:bg-brand-primary-dark disabled:opacity-60 text-white text-sm font-bold px-5 py-2.5 transition-all"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {isNew ? "Create" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setConfirmTarget(null)}
        >
          <div className="crm-panel w-full max-w-md p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                <Trash2 className="h-5 w-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-black text-text-primary">Delete &ldquo;{confirmTarget.label}&rdquo;?</h3>
                <p className="mt-1 text-sm text-text-secondary">
                  The requirement spec is removed, but staff members&rsquo; already-collected files/evidence are kept and stay visible.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                className="rounded-xl ui-card-soft px-4 py-2.5 text-sm font-bold text-text-secondary hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold px-5 py-2.5 transition-colors"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{label}</label>
      {children}
    </div>
  );
}
