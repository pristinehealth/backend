"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGetStaffQuery, useGetStaffByIdQuery } from "@/lib/features/api/perfexApi";
import {
    Mail, Phone, AlertCircle, Loader2, X, Briefcase, CalendarDays,
    Fingerprint, ListTodo, Search, User, ShieldCheck, ShieldAlert, ShieldX, FileText, Eye, Clock3, UserCheck
} from "lucide-react";

export function StaffTab() {
    const router = useRouter();
    const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [authStatus, setAuthStatus] = useState<Record<string, { emailVerified: boolean; hasPassword: boolean }>>({});
    const [complianceCards, setComplianceCards] = useState<any[]>([]);
    const [complianceLoading, setComplianceLoading] = useState(false);
    const [complianceError, setComplianceError] = useState("");
    const [onboarding, setOnboarding] = useState<{ status: string; onboardingId: string | null } | null>(null);
    const [onboardingLoading, setOnboardingLoading] = useState(false);

    const { data: rawData, isLoading, error: rtkError } = useGetStaffQuery();
    const { data: rawDetails, isLoading: detailsLoading } = useGetStaffByIdQuery(selectedStaffId as string, {
        skip: !selectedStaffId
    });

    useEffect(() => {
        fetch('/api/staff/auth-status')
            .then(r => r.json())
            .then(d => { if (d.data) setAuthStatus(d.data); })
            .catch(() => { });
    }, []);

    const staffList: any[] = Array.isArray(rawData) ? rawData : (rawData && Array.isArray(rawData.data) ? rawData.data : []);
    const staffDetails = rawDetails && !Array.isArray(rawDetails) ? rawDetails : null;

    // Compliance documents (the source of truth) — includes metadata-only evidence,
    // not the raw application file dump. Keyed by staffid, bounded by the catalog.
    useEffect(() => {
        const staffId = staffDetails?.staffid;
        if (!staffId) {
            setComplianceCards([]);
            return;
        }

        const controller = new AbortController();
        setComplianceLoading(true);
        setComplianceError("");

        fetch(`/api/admin/compliance/staff/${encodeURIComponent(staffId)}`, {
            signal: controller.signal,
        })
            .then(res => res.json())
            .then(data => {
                setComplianceCards(Array.isArray(data.cards) ? data.cards : []);
            })
            .catch((err) => {
                if (err?.name !== 'AbortError') {
                    setComplianceError('Failed to load compliance.');
                }
            })
            .finally(() => setComplianceLoading(false));

        return () => controller.abort();
    }, [staffDetails?.staffid]);

    // Onboarding status for the selected staff (resolved from their accepted
    // application → onboarding record).
    useEffect(() => {
        const staffId = staffDetails?.staffid;
        if (!staffId) {
            setOnboarding(null);
            return;
        }
        const controller = new AbortController();
        setOnboardingLoading(true);
        fetch(`/api/admin/staff/${encodeURIComponent(staffId)}/onboarding`, { signal: controller.signal })
            .then((res) => res.json())
            .then((data) => setOnboarding({ status: data?.status || 'no_application', onboardingId: data?.onboardingId || null }))
            .catch((err) => { if (err?.name !== 'AbortError') setOnboarding(null); })
            .finally(() => setOnboardingLoading(false));
        return () => controller.abort();
    }, [staffDetails?.staffid]);

    const filtered = search.trim()
        ? staffList.filter(s => `${s.firstname} ${s.lastname} ${s.email}`.toLowerCase().includes(search.toLowerCase()))
        : staffList;

    if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-10 w-10 text-cyan-500 animate-spin" /></div>;
    if (rtkError) return (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-8 text-center text-rose-400">
            <AlertCircle className="h-12 w-12 mx-auto mb-4" />
            <h3 className="font-bold text-lg">Failed to load Staff</h3>
        </div>
    );

    return (
        <>
            {/* Search */}
            <div className="relative max-w-sm mb-5">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search by name or email…"
                    className="w-full pl-9 pr-4 py-2 rounded-xl border border-white/10 bg-black/40 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 outline-none transition-all"
                />
            </div>

            {/* Table */}
            <div className="bg-gradient-to-b from-white/[0.04] to-white/[0.01] rounded-2xl border border-white/[0.06] overflow-hidden shadow-lg">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                        <thead>
                            <tr className="bg-white/[0.02] border-b border-white/[0.06] text-xs font-bold text-slate-400 uppercase tracking-wider">
                                <th className="p-4">Staff Member</th>
                                <th className="p-4">Email</th>
                                <th className="p-4">Phone</th>
                                <th className="p-4">ID</th>
                                <th className="p-4">App Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04]">
                            {!filtered.length ? (
                                <tr>
                                    <td colSpan={5} className="text-center py-12 text-slate-500">
                                        {search ? `No staff matching "${search}".` : "No staff found."}
                                    </td>
                                </tr>
                            ) : filtered.map((staff) => {
                                const status = authStatus[String(staff.staffid)];
                                const badge = !status || !status.hasPassword
                                    ? { label: 'Not Registered', icon: ShieldX, cls: 'bg-white/[0.02] text-slate-500 border border-white/[0.04]' }
                                    : !status.emailVerified
                                        ? { label: 'Unverified', icon: ShieldAlert, cls: 'bg-amber-500/10 text-amber-400 border border-amber-500/20' }
                                        : { label: 'Verified', icon: ShieldCheck, cls: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' };
                                const BadgeIcon = badge.icon;
                                return (
                                    <tr
                                        key={staff.staffid}
                                        onClick={() => router.push(`/staff/${staff.staffid}`)}
                                        className="hover:bg-white/[0.02] cursor-pointer transition-colors group"
                                    >
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-9 w-9 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold flex items-center justify-center text-xs group-hover:bg-cyan-500 group-hover:text-white transition-colors">
                                                    {staff.firstname?.[0]}{staff.lastname?.[0]}
                                                </div>
                                                <span className="font-semibold text-slate-300 group-hover:text-cyan-400 transition-colors">
                                                    {staff.firstname} {staff.lastname}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-slate-400 group-hover:text-slate-300 transition-colors">{staff.email || <span className="text-text-muted italic">N/A</span>}</td>
                                        <td className="p-4 text-slate-400 group-hover:text-slate-300 transition-colors">{staff.phonenumber || <span className="text-text-muted italic">N/A</span>}</td>
                                        <td className="p-4 text-slate-500 font-mono text-xs">#{staff.staffid}</td>
                                        <td className="p-4">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${badge.cls}`}>
                                                <BadgeIcon className="h-3.5 w-3.5" />
                                                {badge.label}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {filtered.length > 0 && (
                    <div className="p-3 border-t border-white/[0.04] bg-white/[0.01] text-[10px] font-bold text-slate-500 text-right uppercase tracking-wider">
                        {filtered.length} staff member{filtered.length !== 1 ? "s" : ""}
                    </div>
                )}
            </div>

            {/* Staff Details Modal */}
            {selectedStaffId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-surface-modal border border-border-modal w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden relative">
                        <button 
                            onClick={() => setSelectedStaffId(null)} 
                            className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white hover:bg-white/[0.05] rounded-lg transition-all"
                        >
                            <X className="h-5 w-5" />
                        </button>
                        
                        <div className="px-6 py-4 border-b border-white/[0.06] bg-white/[0.01]">
                            <h3 className="font-bold text-base text-white flex items-center gap-2">
                                <User className="h-5 w-5 text-cyan-400" /> Staff Profile
                            </h3>
                        </div>
                        
                        <div className="p-6">
                            {detailsLoading ? (
                                <div className="flex py-20 justify-center">
                                    <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
                                </div>
                            ) : staffDetails ? (
                                <div className="space-y-6">
                                    <div className="flex items-center gap-6 pb-6 border-b border-white/[0.06]">
                                        <div className="h-16 w-16 shrink-0 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-2xl">
                                            {staffDetails.firstname?.[0]}{staffDetails.lastname?.[0]}
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-bold text-white">{staffDetails.firstname} {staffDetails.lastname}</h2>
                                            <div className="flex flex-wrap gap-2 mt-1.5">
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">
                                                    <Fingerprint className="h-3 w-3" /> ID: {staffDetails.staffid}
                                                </span>
                                                {(() => {
                                                    const s = authStatus[String(staffDetails.staffid)];
                                                    if (!s || !s.hasPassword) return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/[0.02] text-slate-500 border border-white/[0.04]"><ShieldX className="h-3 w-3" /> App: Not Registered</span>;
                                                    if (!s.emailVerified) return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20"><ShieldAlert className="h-3 w-3" /> App: Unverified</span>;
                                                    return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><ShieldCheck className="h-3 w-3" /> App: Verified</span>;
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-3">
                                                <Mail className="h-4.5 w-4.5 text-slate-500" />
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Email</p>
                                                    <p className="font-semibold text-slate-300 break-all">{staffDetails.email || 'Not provided'}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <Phone className="h-4.5 w-4.5 text-slate-500" />
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Phone</p>
                                                    <p className="font-semibold text-slate-300">{staffDetails.phonenumber || 'Not provided'}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-3">
                                                <Briefcase className="h-4.5 w-4.5 text-slate-500" />
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Language</p>
                                                    <p className="font-semibold text-slate-300 capitalize">{staffDetails.default_language || 'System Default'}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <CalendarDays className="h-4.5 w-4.5 text-slate-500" />
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date Created</p>
                                                    <p className="font-semibold text-slate-300">{staffDetails.datecreated?.split(' ')[0] || 'Unknown'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {staffDetails.customfields?.length > 0 && (
                                        <div className="border-t border-white/[0.06] pt-5">
                                            <h4 className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">
                                                <ListTodo className="h-3.5 w-3.5" /> Custom Fields
                                            </h4>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {staffDetails.customfields.map((cf: any, i: number) => (
                                                    <div key={i} className="bg-black/25 p-3 rounded-xl border border-white/[0.04]">
                                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{cf.label}</p>
                                                        <p className="text-xs font-bold text-slate-200 mt-0.5">{cf.value || <span className="text-text-muted font-normal italic">Empty</span>}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="border-t border-white/[0.06] pt-5 space-y-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <h4 className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                                <UserCheck className="h-3.5 w-3.5" /> Onboarding
                                            </h4>
                                            <button
                                                type="button"
                                                onClick={() => router.push('/dashboard?tab=onboarding')}
                                                className="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 uppercase tracking-wider"
                                            >
                                                Open onboarding →
                                            </button>
                                        </div>
                                        {onboardingLoading ? (
                                            <div className="flex items-center gap-2 text-slate-500 text-xs">
                                                <Loader2 className="h-4 w-4 animate-spin text-cyan-500" /> Loading onboarding...
                                            </div>
                                        ) : (() => {
                                            const s = onboarding?.status;
                                            if (!s || s === 'no_application') {
                                                return <div className="text-xs text-slate-500 italic bg-black/20 rounded-xl p-3">No accepted application on file.</div>;
                                            }
                                            const meta = s === 'completed'
                                                ? { label: 'Completed', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' }
                                                : s === 'in_progress'
                                                    ? { label: 'In progress', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' }
                                                    : { label: 'Not started', cls: 'bg-white/5 text-slate-400 border-white/10' };
                                            return (
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${meta.cls}`}>
                                                    {meta.label}
                                                </span>
                                            );
                                        })()}
                                    </div>

                                    <div className="border-t border-white/[0.06] pt-5 space-y-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <h4 className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                                <ShieldCheck className="h-3.5 w-3.5" /> Compliance Documents
                                            </h4>
                                            <button
                                                type="button"
                                                onClick={() => router.push(`/dashboard?tab=compliance&staff=${encodeURIComponent(staffDetails.staffid)}`)}
                                                className="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 uppercase tracking-wider"
                                            >
                                                Open full compliance →
                                            </button>
                                        </div>

                                        {complianceLoading ? (
                                            <div className="flex items-center gap-2 text-slate-500 text-xs">
                                                <Loader2 className="h-4 w-4 animate-spin text-cyan-500" /> Loading compliance...
                                            </div>
                                        ) : complianceError ? (
                                            <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">{complianceError}</div>
                                        ) : complianceCards.length > 0 ? (
                                            <div className="grid grid-cols-1 gap-3 max-h-72 overflow-y-auto pr-1">
                                                {complianceCards.map((card) => {
                                                    const s = String(card.status);
                                                    const badge = s === 'verified' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                        : s === 'pending' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                                        : (s === 'expired' || s === 'rejected') ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                                        : 'bg-white/5 text-slate-400 border-white/10';
                                                    return (
                                                        <div key={card.requirementKey} className="bg-black/25 p-4 rounded-xl border border-white/[0.04] space-y-2">
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-bold text-slate-200 break-words">{card.label}</p>
                                                                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                                                                        {card.evidenceMode === 'metadata_only' ? 'Metadata (no file)' : 'File'}
                                                                        {card.isMandatory ? ' · Mandatory' : ''}
                                                                    </p>
                                                                </div>
                                                                <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge}`}>
                                                                    {s.toUpperCase()}
                                                                </span>
                                                            </div>
                                                            <div className="flex flex-wrap gap-4 text-[10px] text-slate-500">
                                                                {card.requiresExpiry && (
                                                                    <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> Expiry: {card.expiryDate ? new Date(card.expiryDate).toLocaleDateString() : 'None set'}</span>
                                                                )}
                                                                {card.evidence?.fileUrl ? (
                                                                    <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" /> <a href={`/api/admin/file?src=${encodeURIComponent(card.evidence.fileUrl)}`} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">View file</a></span>
                                                                ) : card.evidence?.reference ? (
                                                                    <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" /> Recorded: <span className="text-slate-300 font-semibold">{card.evidence.reference}</span></span>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" /> No evidence</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="text-xs text-slate-500 italic bg-black/20 rounded-xl p-3">No compliance requirements apply to this staff member.</div>
                                        )}
                                    </div>
                                </div>
                            ) : <div className="text-center py-10 text-slate-500">Failed to load profile.</div>}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
