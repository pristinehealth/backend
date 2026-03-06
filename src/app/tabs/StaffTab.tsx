"use client";

import { useState } from "react";
import { useGetStaffQuery, useGetStaffByIdQuery } from "@/lib/features/api/perfexApi";
import { Mail, Phone, AlertCircle, Loader2, X, Briefcase, CalendarDays, Fingerprint, ListTodo, Search, User } from "lucide-react";

export function StaffTab() {
    const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
    const [search, setSearch] = useState("");

    const { data: rawData, isLoading, error: rtkError } = useGetStaffQuery();
    const { data: rawDetails, isLoading: detailsLoading } = useGetStaffByIdQuery(selectedStaffId as string, {
        skip: !selectedStaffId
    });

    const staffList: any[] = Array.isArray(rawData) ? rawData : (rawData && Array.isArray(rawData.data) ? rawData.data : []);
    const staffDetails = rawDetails && !Array.isArray(rawDetails) ? rawDetails : null;

    const filtered = search.trim()
        ? staffList.filter(s => `${s.firstname} ${s.lastname} ${s.email}`.toLowerCase().includes(search.toLowerCase()))
        : staffList;

    if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-10 w-10 text-brand-blue animate-spin" /></div>;
    if (rtkError) return <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center text-red-600"><AlertCircle className="h-12 w-12 mx-auto mb-4" /><h3 className="font-bold text-lg">Failed to load Staff</h3></div>;

    return (
        <>
            {/* Search */}
            <div className="relative max-w-sm mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search by name or email…"
                    className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-blue"
                />
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 uppercase tracking-wider">
                                <th className="p-4">Staff Member</th>
                                <th className="p-4">Email</th>
                                <th className="p-4">Phone</th>
                                <th className="p-4">ID</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                            {!filtered.length ? (
                                <tr><td colSpan={4} className="text-center py-12 text-slate-400">{search ? `No staff matching "${search}".` : "No staff found."}</td></tr>
                            ) : filtered.map((staff) => (
                                <tr
                                    key={staff.staffid}
                                    onClick={() => setSelectedStaffId(staff.staffid)}
                                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors group"
                                >
                                    <td className="p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="h-9 w-9 rounded-xl bg-brand-blue-muted text-brand-blue font-bold flex items-center justify-center text-sm group-hover:bg-brand-blue group-hover:text-white transition-colors">
                                                {staff.firstname?.[0]}{staff.lastname?.[0]}
                                            </div>
                                            <span className="font-semibold text-slate-900 dark:text-white group-hover:text-brand-blue dark:group-hover:text-brand-blue-light transition-colors">
                                                {staff.firstname} {staff.lastname}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="p-4 text-sm text-slate-600 dark:text-slate-300">{staff.email || <span className="text-slate-400 italic">N/A</span>}</td>
                                    <td className="p-4 text-sm text-slate-600 dark:text-slate-300">{staff.phonenumber || <span className="text-slate-400 italic">N/A</span>}</td>
                                    <td className="p-4 text-sm text-slate-400 font-mono">#{staff.staffid}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {filtered.length > 0 && (
                    <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-400 text-right">
                        {filtered.length} staff member{filtered.length !== 1 ? "s" : ""}
                    </div>
                )}
            </div>

            {/* Staff Details Modal */}
            {selectedStaffId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
                            <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2"><User className="h-5 w-5 text-brand-blue" /> Staff Profile</h3>
                            <button onClick={() => setSelectedStaffId(null)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors"><X className="h-5 w-5 text-slate-500" /></button>
                        </div>
                        <div className="p-6">
                            {detailsLoading ? (
                                <div className="flex py-20 justify-center"><Loader2 className="h-8 w-8 animate-spin text-brand-blue" /></div>
                            ) : staffDetails ? (
                                <div className="space-y-6">
                                    <div className="flex items-center gap-6 pb-6 border-b border-slate-100 dark:border-slate-800">
                                        <div className="h-20 w-20 shrink-0 rounded-2xl bg-brand-blue-muted flex items-center justify-center text-brand-blue font-bold text-3xl">{staffDetails.firstname?.[0]}{staffDetails.lastname?.[0]}</div>
                                        <div>
                                            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">{staffDetails.firstname} {staffDetails.lastname}</h2>
                                            <span className="inline-flex mt-1 items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-orange/10 text-brand-orange"><Fingerprint className="h-3 w-3" /> ID: {staffDetails.staffid}</span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300"><Mail className="h-4 w-4 text-slate-400" /><div><p className="text-xs font-bold text-slate-400 mb-0.5">Email</p><p className="font-medium break-all text-sm">{staffDetails.email || 'Not provided'}</p></div></div>
                                            <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300"><Phone className="h-4 w-4 text-slate-400" /><div><p className="text-xs font-bold text-slate-400 mb-0.5">Phone</p><p className="font-medium text-sm">{staffDetails.phonenumber || 'Not provided'}</p></div></div>
                                        </div>
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300"><Briefcase className="h-4 w-4 text-slate-400" /><div><p className="text-xs font-bold text-slate-400 mb-0.5">Language</p><p className="font-medium text-sm capitalize">{staffDetails.default_language || 'System Default'}</p></div></div>
                                            <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300"><CalendarDays className="h-4 w-4 text-slate-400" /><div><p className="text-xs font-bold text-slate-400 mb-0.5">Date Created</p><p className="font-medium text-sm">{staffDetails.datecreated?.split(' ')[0] || 'Unknown'}</p></div></div>
                                        </div>
                                    </div>
                                    {staffDetails.customfields?.length > 0 && (
                                        <div className="border-t border-slate-100 dark:border-slate-800 pt-5">
                                            <h4 className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-3"><ListTodo className="h-3.5 w-3.5" /> Custom Fields</h4>
                                            <div className="grid grid-cols-2 gap-3">
                                                {staffDetails.customfields.map((cf: any, i: number) => (
                                                    <div key={i} className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                                                        <p className="text-xs text-slate-400 mb-0.5">{cf.label}</p>
                                                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{cf.value || <span className="text-slate-400 font-normal italic">Empty</span>}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : <div className="text-center py-10 text-slate-400">Failed to load profile.</div>}
                        </div>
                        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                            <button onClick={() => setSelectedStaffId(null)} className="px-5 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-white rounded-xl font-bold transition-colors text-sm">Close</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
