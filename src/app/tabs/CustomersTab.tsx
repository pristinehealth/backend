"use client";

import { useState } from "react";
import { useGetCustomersQuery } from "@/lib/features/api/perfexApi";
import { Loader2, AlertCircle, Building2, MapPin, X, Phone, Globe, Hash, CreditCard, ListTodo, Search } from "lucide-react";

export function CustomersTab() {
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const { data: rawData, isLoading, error: rtkError } = useGetCustomersQuery();

    const customerList: any[] = Array.isArray(rawData) ? rawData : (rawData && Array.isArray((rawData as any).data) ? (rawData as any).data : []);
    const selectedCustomer = selectedCustomerId ? customerList.find(c => c.userid === selectedCustomerId) : null;

    const filtered = search.trim()
        ? customerList.filter(c => `${c.company} ${c.city} ${c.country}`.toLowerCase().includes(search.toLowerCase()))
        : customerList;

    if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-10 w-10 text-cyan-500 animate-spin" /></div>;
    if (rtkError) return (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-8 text-center text-rose-400">
            <AlertCircle className="h-12 w-12 mx-auto mb-4" />
            <h3 className="font-bold text-lg">Failed to load Customers</h3>
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
                    placeholder="Search by company or location…"
                    className="w-full pl-9 pr-4 py-2 rounded-xl border border-white/10 bg-black/40 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 outline-none transition-all"
                />
            </div>

            {/* Table */}
            <div className="bg-gradient-to-b from-white/[0.04] to-white/[0.01] rounded-2xl border border-white/[0.06] overflow-hidden shadow-lg">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                        <thead>
                            <tr className="bg-white/[0.02] border-b border-white/[0.06] text-xs font-bold text-slate-400 uppercase tracking-wider">
                                <th className="p-4">Company</th>
                                <th className="p-4">Location</th>
                                <th className="p-4">Phone</th>
                                <th className="p-4">Status</th>
                                <th className="p-4">ID</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04]">
                            {!filtered.length ? (
                                <tr>
                                    <td colSpan={5} className="text-center py-12 text-slate-500">
                                        {search ? `No customers matching "${search}".` : "No customers found."}
                                    </td>
                                </tr>
                            ) : filtered.map((customer) => (
                                <tr
                                    key={customer.userid}
                                    onClick={() => setSelectedCustomerId(customer.userid)}
                                    className="hover:bg-white/[0.02] cursor-pointer transition-colors group"
                                >
                                    <td className="p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="h-9 w-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center group-hover:bg-cyan-500 group-hover:text-white transition-colors">
                                                <Building2 className="h-4 w-4" />
                                            </div>
                                            <span className="font-semibold text-slate-300 group-hover:text-cyan-400 transition-colors">{customer.company}</span>
                                        </div>
                                    </td>
                                    <td className="p-4 text-slate-400 group-hover:text-slate-300 transition-colors">
                                        {customer.city ? (
                                            <span className="flex items-center gap-1">
                                                <MapPin className="h-3.5 w-3.5 text-slate-500" />
                                                {customer.city}, {customer.country}
                                            </span>
                                        ) : (
                                            <span className="text-text-muted italic">N/A</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-slate-400 group-hover:text-slate-300 transition-colors">{customer.phonenumber || <span className="text-text-muted italic">N/A</span>}</td>
                                    <td className="p-4">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                            customer.active === "1" 
                                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                                                : "bg-white/[0.02] text-slate-500 border border-white/[0.04]"
                                        }`}>
                                            {customer.active === "1" ? "Active" : "Inactive"}
                                        </span>
                                    </td>
                                    <td className="p-4 text-slate-500 font-mono text-xs">#{customer.userid}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {filtered.length > 0 && (
                    <div className="p-3 border-t border-white/[0.04] bg-white/[0.01] text-[10px] font-bold text-slate-500 text-right uppercase tracking-wider">
                        {filtered.length} customer{filtered.length !== 1 ? "s" : ""}
                    </div>
                )}
            </div>

            {/* Customer Details Modal */}
            {selectedCustomerId && selectedCustomer && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-surface-modal border border-border-modal w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] relative">
                        <button 
                            onClick={() => setSelectedCustomerId(null)} 
                            className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white hover:bg-white/[0.05] rounded-lg transition-all z-10"
                        >
                            <X className="h-5 w-5" />
                        </button>

                        <div className="px-6 py-4 border-b border-white/[0.06] bg-white/[0.01] flex items-center shrink-0">
                            <h3 className="font-bold text-base text-white flex items-center gap-2">
                                <Building2 className="h-5 w-5 text-cyan-400" /> Customer Details
                            </h3>
                        </div>

                        <div className="p-6 md:p-8 overflow-y-auto">
                            <div className="space-y-8">
                                <div className="border-b border-white/[0.06] pb-8 flex items-center gap-4">
                                    <div className="h-16 w-16 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-2xl flex items-center justify-center shrink-0">
                                        <Building2 className="h-8 w-8" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">ID: {selectedCustomer.userid}</span>
                                            {selectedCustomer.active === "1" && (
                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Active</span>
                                            )}
                                        </div>
                                        <h2 className="text-xl font-bold text-white">{selectedCustomer.company}</h2>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-6">
                                        <div>
                                            <h4 className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3 border-b border-white/[0.06] pb-2">
                                                <Hash className="h-3.5 w-3.5" /> Identification
                                            </h4>
                                            <div className="bg-black/25 p-4 rounded-2xl border border-white/[0.04] space-y-3 text-xs">
                                                <div className="flex justify-between"><span className="text-slate-500">VAT Number</span><span className="font-bold text-slate-200">{selectedCustomer.vat || 'N/A'}</span></div>
                                                <div className="flex justify-between"><span className="text-slate-500">Group</span><span className="font-bold text-slate-200">{selectedCustomer.groups || 'None'}</span></div>
                                                <div className="flex justify-between"><span className="text-slate-500">Created</span><span className="font-bold text-slate-200">{selectedCustomer.datecreated || 'Unknown'}</span></div>
                                            </div>
                                        </div>
                                        <div>
                                            <h4 className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3 border-b border-white/[0.06] pb-2">
                                                <Phone className="h-3.5 w-3.5" /> Contact
                                            </h4>
                                            <div className="bg-black/25 p-4 rounded-2xl border border-white/[0.04] space-y-3 text-xs">
                                                <div className="flex justify-between"><span className="text-slate-500">Phone</span><span className="font-bold text-slate-200">{selectedCustomer.phonenumber || 'N/A'}</span></div>
                                                <div className="flex justify-between"><span className="text-slate-500">Website</span><span className="font-bold text-cyan-400 truncate max-w-[200px]">{selectedCustomer.website || 'N/A'}</span></div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-6">
                                        <div>
                                            <h4 className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3 border-b border-white/[0.06] pb-2">
                                                <MapPin className="h-3.5 w-3.5" /> Billing Address
                                            </h4>
                                            <div className="bg-black/25 p-4 rounded-2xl border border-white/[0.04] text-xs text-slate-300 space-y-1">
                                                <p className="font-bold text-slate-200">{selectedCustomer.billing_street || selectedCustomer.address || 'Not provided'}</p>
                                                {(selectedCustomer.billing_city || selectedCustomer.city) && <p>{selectedCustomer.billing_city || selectedCustomer.city}, {selectedCustomer.billing_state || selectedCustomer.state}</p>}
                                                {(selectedCustomer.billing_country || selectedCustomer.country) && <p>{selectedCustomer.billing_country || selectedCustomer.country}</p>}
                                            </div>
                                        </div>
                                        <div>
                                            <h4 className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3 border-b border-white/[0.06] pb-2">
                                                <CreditCard className="h-3.5 w-3.5" /> Preferences
                                            </h4>
                                            <div className="bg-black/25 p-4 rounded-2xl border border-white/[0.04] space-y-3 text-xs">
                                                <div className="flex justify-between"><span className="text-slate-500">Currency</span><span className="font-bold text-slate-200 uppercase">{selectedCustomer.default_currency || 'Default'}</span></div>
                                                <div className="flex justify-between"><span className="text-slate-500">Language</span><span className="font-bold text-slate-200 capitalize">{selectedCustomer.default_language || 'System Default'}</span></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                {selectedCustomer.customfields?.length > 0 && (
                                    <div className="border-t border-white/[0.06] pt-6">
                                        <h4 className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-4">
                                            <ListTodo className="h-3.5 w-3.5" /> Custom Fields
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {selectedCustomer.customfields.map((cf: any, i: number) => (
                                                <div key={i} className="bg-black/25 p-3 rounded-xl border border-white/[0.04] flex justify-between text-xs">
                                                    <span className="text-slate-500">{cf.label}</span>
                                                    <span className="font-bold text-slate-200">{cf.value || <span className="text-text-muted italic">Empty</span>}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
