"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Eye,
  Fingerprint,
  Loader2,
  Save,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  User,
} from "lucide-react";
import { type ComplianceSummary, overallStatus, OVERALL_META } from "../../tabs/compliance/shared";

type StaffField = { label?: string; value?: string };

interface StaffDetail {
  staffid: string;
  email?: string;
  firstname?: string;
  lastname?: string;
  phonenumber?: string;
  datecreated?: string;
  default_language?: string;
  customfields?: StaffField[];
}

export default function StaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [staff, setStaff] = useState<StaffDetail | null>(null);
  const [authStatus, setAuthStatus] = useState<Record<string, { emailVerified: boolean; hasPassword: boolean }>>({});
  const [expiryDrafts, setExpiryDrafts] = useState<Record<string, string>>({});
  const [complianceSummary, setComplianceSummary] = useState<ComplianceSummary | null>(null);
  const [complianceCards, setComplianceCards] = useState<any[]>([]);
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    fetch('/api/staff/auth-status')
      .then(res => res.json())
      .then(data => {
        if (data.data) setAuthStatus(data.data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadStaff = async () => {
      setLoading(true);
      setPageError("");
      try {
        const res = await fetch(`/api/staff/${id}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load staff profile.');
        }
        if (!cancelled) {
          setStaff(data);
        }
      } catch (error: any) {
        if (!cancelled) {
          setPageError(error?.message || 'Failed to load staff profile.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadStaff();

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    const controller = new AbortController();
    setComplianceLoading(true);

    fetch(`/api/admin/compliance/staff/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        setComplianceSummary(data.summary ?? null);
        const cards = Array.isArray(data.cards) ? data.cards : [];
        setComplianceCards(cards);
        setExpiryDrafts(
          Object.fromEntries(cards.map((c: any) => [c.requirementKey, c.expiryDate ? new Date(c.expiryDate).toISOString().split('T')[0] : ""]))
        );
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') {
          setComplianceSummary(null);
        }
      })
      .finally(() => setComplianceLoading(false));

    return () => controller.abort();
  }, [id]);

  const appStatus = staff?.staffid ? authStatus[String(staff.staffid)] : undefined;

  const stats = useMemo(() => ({
    total: complianceSummary?.total ?? 0,
    verified: complianceSummary?.verified ?? 0,
    pending: complianceSummary?.pending ?? 0,
    expired: complianceSummary?.expired ?? 0,
  }), [complianceSummary]);

  const getStatusBadge = (status: string) => {
    if (status === 'expired' || status === 'rejected') return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    if (status === 'pending') return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    if (status === 'verified') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    return 'ui-card-soft ui-muted';
  };

  const reloadCompliance = async () => {
    try {
      const res = await fetch(`/api/admin/compliance/staff/${encodeURIComponent(id)}`);
      const data = await res.json();
      setComplianceSummary(data.summary ?? null);
      setComplianceCards(Array.isArray(data.cards) ? data.cards : []);
    } catch { /* noop */ }
  };

  const saveExpiry = async (requirementKey: string) => {
    setSavingKey(requirementKey);
    setActionMessage("");
    try {
      const response = await fetch(`/api/admin/compliance/staff/${encodeURIComponent(id)}/${encodeURIComponent(requirementKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_expiry', expiryDate: expiryDrafts[requirementKey] || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update expiry date.');
      await reloadCompliance();
      setActionMessage(`${requirementKey} expiry updated.`);
    } catch (error: any) {
      setActionMessage(error?.message || 'Failed to update expiry date.');
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <Loader2 className="h-10 w-10 animate-spin text-brand-primary" />
      </div>
    );
  }

  if (pageError || !staff) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4 text-center">
        <h1 className="text-2xl font-black text-text-primary mb-2">Staff Profile Unavailable</h1>
        <p className="text-sm text-text-secondary max-w-md mb-6">{pageError || 'The requested staff profile could not be found.'}</p>
        <Link href="/dashboard?tab=staff" className="bg-brand-primary hover:bg-brand-primary-dark text-white font-bold text-sm px-6 py-2.5 rounded-xl transition-all">
          Back to staff list
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden flex flex-col font-sans">
      <div className="absolute top-[-280px] left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-brand-primary-muted rounded-full blur-[150px] pointer-events-none opacity-45" />
      <div className="absolute bottom-[-220px] right-[10%] w-[520px] h-[380px] bg-brand-accent-muted rounded-full blur-[130px] pointer-events-none opacity-30" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.012)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.012)_1px,transparent_1px)] bg-[size:56px_56px] pointer-events-none" />

      <header className="relative border-b border-sidebar-border backdrop-blur-md bg-sidebar-bg/85 py-4 shrink-0 z-10">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between gap-4">
          <Link href="/dashboard?tab=staff" className="inline-flex items-center gap-2 text-sm font-bold text-text-secondary hover:text-text-primary transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to staff list
          </Link>
          <div className="text-right">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-text-muted">Staff detail page</p>
            <h1 className="text-lg font-black text-text-primary">{staff.firstname} {staff.lastname}</h1>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 max-w-6xl w-full mx-auto px-4 py-8 space-y-6">
        <section className="crm-panel p-6 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-primary-muted text-brand-primary border border-brand-primary/20 text-xs font-bold uppercase tracking-widest">
                <User className="h-3.5 w-3.5" /> Staff profile
              </div>
              <div>
                <h2 className="text-3xl md:text-4xl font-black text-text-primary tracking-tight">
                  {staff.firstname} {staff.lastname}
                </h2>
                <p className="mt-2 text-sm text-text-secondary max-w-2xl">
                  View the staff profile, submitted document set, and expiry dates from one place.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <Fingerprint className="h-3.5 w-3.5" /> ID: {staff.staffid}
                </span>
                {(() => {
                  if (!appStatus || !appStatus.hasPassword) return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ui-card-soft ui-muted"><ShieldX className="h-3.5 w-3.5" /> App: Not Registered</span>;
                  if (!appStatus.emailVerified) return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20"><ShieldAlert className="h-3.5 w-3.5" /> App: Unverified</span>;
                  return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><ShieldCheck className="h-3.5 w-3.5" /> App: Verified</span>;
                })()}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:min-w-[420px]">
              <div className="ui-card-soft rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Requirements</p>
                <p className="mt-2 text-2xl font-black text-text-primary">{stats.total}</p>
              </div>
              <div className="ui-card-soft rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Verified</p>
                <p className="mt-2 text-2xl font-black text-emerald-500">{stats.verified}</p>
              </div>
              <div className="ui-card-soft rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Pending</p>
                <p className="mt-2 text-2xl font-black text-amber-500">{stats.pending}</p>
              </div>
              <div className="ui-card-soft rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Expired</p>
                <p className="mt-2 text-2xl font-black text-rose-500">{stats.expired}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="crm-panel p-6 md:p-7 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-text-muted">Compliance</p>
              <h3 className="mt-1 text-xl font-black text-text-primary">Compliance status</h3>
            </div>
            {complianceSummary && (() => {
              const meta = OVERALL_META[overallStatus(complianceSummary)];
              return (
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${meta.className}`}>
                  {meta.label}
                </span>
              );
            })()}
          </div>

          {complianceLoading ? (
            <div className="flex items-center py-4 text-text-secondary">
              <Loader2 className="h-6 w-6 animate-spin text-brand-primary" />
            </div>
          ) : complianceSummary ? (
            <>
              <div className="flex flex-wrap gap-2 text-[10px] font-bold">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Verified {complianceSummary.verified}</span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">Pending {complianceSummary.pending}</span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">Expired {complianceSummary.expired}</span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full ui-card-soft ui-muted">Missing {complianceSummary.missing}</span>
              </div>

              {complianceSummary.mandatoryMissing > 0 && (
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-400 inline-flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4" />
                  {complianceSummary.mandatoryMissing} mandatory requirement{complianceSummary.mandatoryMissing === 1 ? '' : 's'} missing.
                </div>
              )}

              <Link
                href={`/dashboard?tab=compliance&staff=${encodeURIComponent(id)}`}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-primary hover:text-brand-primary-dark transition-colors"
              >
                <ShieldCheck className="h-4 w-4" /> Open full compliance
              </Link>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-border-card bg-surface-card p-6 text-sm text-text-secondary">
              No compliance data for this staff member.
            </div>
          )}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="crm-panel p-6 md:p-7 space-y-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-text-muted">Profile details</p>
              <h3 className="mt-1 text-xl font-black text-text-primary">Staff data</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="ui-card-soft rounded-2xl p-4 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Email</p>
                <p className="font-semibold text-text-primary break-all">{staff.email || 'Not provided'}</p>
              </div>
              <div className="ui-card-soft rounded-2xl p-4 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Phone</p>
                <p className="font-semibold text-text-primary">{staff.phonenumber || 'Not provided'}</p>
              </div>
              <div className="ui-card-soft rounded-2xl p-4 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Language</p>
                <p className="font-semibold text-text-primary capitalize">{staff.default_language || 'System Default'}</p>
              </div>
              <div className="ui-card-soft rounded-2xl p-4 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Created</p>
                <p className="font-semibold text-text-primary">{staff.datecreated?.split(' ')[0] || 'Unknown'}</p>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-text-muted mb-3">Submitted data</p>
              {staff.customfields?.length ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {staff.customfields.map((field, index) => (
                    <div key={`${field.label || 'field'}-${index}`} className="ui-card-soft rounded-2xl p-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{field.label || 'Field'}</p>
                      <p className="mt-1 text-sm font-semibold text-text-primary break-words">{field.value || 'Empty'}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border-card bg-surface-card p-4 text-sm text-text-secondary">
                  No submitted custom fields recorded for this staff profile.
                </div>
              )}
            </div>
          </div>

          <div className="crm-panel p-6 md:p-7 space-y-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-text-muted">Compliance documents</p>
              <h3 className="mt-1 text-xl font-black text-text-primary">Documents &amp; expiry</h3>
              <p className="mt-2 text-sm text-text-secondary">Files and metadata records for this staff member, with expiry controls.</p>
            </div>

            {actionMessage && (
              <div className="rounded-2xl border border-brand-primary/20 bg-brand-primary-muted px-4 py-3 text-sm font-semibold text-brand-primary">
                {actionMessage}
              </div>
            )}

            {complianceLoading ? (
              <div className="flex items-center justify-center py-12 text-text-secondary">
                <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
              </div>
            ) : complianceCards.length > 0 ? (
              <div className="max-h-[560px] overflow-y-auto pr-1 space-y-4">
                {complianceCards.map((card) => (
                  <div key={card.requirementKey} className="ui-card rounded-3xl p-4 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-black text-text-primary break-words">{card.label}</h4>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadge(String(card.status))}`}>
                            {String(card.status).toUpperCase()}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-text-secondary">
                          {card.evidenceMode === 'metadata_only' ? 'Metadata (no file stored)' : 'File'}{card.isMandatory ? ' · Mandatory' : ''}
                        </p>
                      </div>
                      {card.evidence?.fileUrl ? (
                        <a href={card.evidence.fileUrl} target="_blank" rel="noreferrer" className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold text-brand-primary hover:text-brand-primary-dark transition-colors">
                          <Eye className="h-3.5 w-3.5" /> View file
                        </a>
                      ) : card.evidence?.reference ? (
                        <span className="shrink-0 text-xs text-text-secondary">Recorded: <span className="font-bold text-text-primary">{card.evidence.reference}</span></span>
                      ) : (
                        <span className="shrink-0 text-xs text-text-muted">No evidence</span>
                      )}
                    </div>

                    {card.requiresExpiry && (
                      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Expiry date</label>
                          <input
                            type="date"
                            value={expiryDrafts[card.requirementKey] || ''}
                            onChange={(event) => setExpiryDrafts(prev => ({ ...prev, [card.requirementKey]: event.target.value }))}
                            className="w-full text-sm bg-bg-input border border-border-input rounded-xl px-4 py-2.5 text-text-input outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/40"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => saveExpiry(card.requirementKey)}
                          disabled={savingKey === card.requirementKey}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-primary hover:bg-brand-primary-dark disabled:opacity-60 text-white text-xs font-bold px-4 py-2.5 transition-all"
                        >
                          {savingKey === card.requirementKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          Save expiry
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border-card bg-surface-card p-6 text-sm text-text-secondary">
                No compliance requirements apply to this staff member.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}