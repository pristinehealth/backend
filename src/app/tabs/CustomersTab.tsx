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

    if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-10 w-10 text-brand-blue animate-spin" /></div>;
    if (rtkError) return <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center text-red-600"><AlertCircle className="h-12 w-12 mx-auto mb-4" /><h3 className="font-bold text-lg">Failed to load Customers</h3></div>;

    return (
        <>
            {/* Search */}
            <div className="relative max-w-sm mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search by company or location…"
                    className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-blue"
                />
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 uppercase tracking-wider">
                                <th className="p-4">Company</th>
                                <th className="p-4">Location</th>
                                <th className="p-4">Phone</th>
                                <th className="p-4">Status</th>
                                <th className="p-4">ID</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                            {!filtered.length ? (
                                <tr><td colSpan={5} className="text-center py-12 text-slate-400">{search ? `No customers matching "${search}".` : "No customers found."}</td></tr>
                            ) : filtered.map((customer) => (
                                <tr
                                    key={customer.userid}
                                    onClick={() => setSelectedCustomerId(customer.userid)}
                                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors group"
                                >
                                    <td className="p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-brand-blue group-hover:text-white transition-colors">
                                                <Building2 className="h-4 w-4" />
                                            </div>
                                            <span className="font-semibold text-slate-900 dark:text-white group-hover:text-brand-blue dark:group-hover:text-brand-blue-light transition-colors">{customer.company}</span>
                                        </div>
                                    </td>
                                    <td className="p-4 text-sm text-slate-600 dark:text-slate-300">
                                        {customer.city ? <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-slate-400" />{customer.city}, {customer.country}</span> : <span className="text-slate-400 italic">N/A</span>}
                                    </td>
                                    <td className="p-4 text-sm text-slate-600 dark:text-slate-300">{customer.phonenumber || <span className="text-slate-400 italic">N/A</span>}</td>
                                    <td className="p-4">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${customer.active === "1" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                                            {customer.active === "1" ? "Active" : "Inactive"}
                                        </span>
                                    </td>
                                    <td className="p-4 text-sm text-slate-400 font-mono">#{customer.userid}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {filtered.length > 0 && (
                    <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-400 text-right">
                        {filtered.length} customer{filtered.length !== 1 ? "s" : ""}
                    </div>
                )}
            </div>

            {/* Customer Details Modal */}
            {selectedCustomerId && selectedCustomer && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 shrink-0">
                            <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2"><Building2 className="h-5 w-5 text-brand-blue" /> Customer Details</h3>
                            <button onClick={() => setSelectedCustomerId(null)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors"><X className="h-5 w-5 text-slate-500" /></button>
                        </div>
                        <div className="p-6 md:p-8 overflow-y-auto">
                            <div className="space-y-8">
                                <div className="border-b border-slate-100 dark:border-slate-800 pb-8 flex items-center gap-4">
                                    <div className="h-16 w-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center shrink-0"><Building2 className="h-8 w-8" /></div>
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-blue-muted text-brand-blue">ID: {selectedCustomer.userid}</span>
                                            {selectedCustomer.active === "1" && <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-600">Active</span>}
                                        </div>
                                        <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white">{selectedCustomer.company}</h2>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-6">
                                        <div><h4 className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 border-b border-slate-100 dark:border-slate-800 pb-2"><Hash className="h-3.5 w-3.5" /> Identification</h4>
                                            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-3">
                                                <div className="flex justify-between text-sm"><span className="text-slate-500">VAT Number</span><span className="font-semibold text-slate-900 dark:text-white">{selectedCustomer.vat || 'N/A'}</span></div>
                                                <div className="flex justify-between text-sm"><span className="text-slate-500">Group</span><span className="font-semibold text-slate-900 dark:text-white">{selectedCustomer.groups || 'None'}</span></div>
                                                <div className="flex justify-between text-sm"><span className="text-slate-500">Created</span><span className="font-medium text-slate-900 dark:text-white">{selectedCustomer.datecreated || 'Unknown'}</span></div>
                                            </div>
                                        </div>
                                        <div><h4 className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 border-b border-slate-100 dark:border-slate-800 pb-2"><Phone className="h-3.5 w-3.5" /> Contact</h4>
                                            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-3">
                                                <div className="flex justify-between text-sm"><span className="text-slate-500">Phone</span><span className="font-semibold text-slate-900 dark:text-white">{selectedCustomer.phonenumber || 'N/A'}</span></div>
                                                <div className="flex justify-between text-sm"><span className="text-slate-500">Website</span><span className="font-medium text-brand-blue truncate max-w-[200px]">{selectedCustomer.website || 'N/A'}</span></div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-6">
                                        <div><h4 className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 border-b border-slate-100 dark:border-slate-800 pb-2"><MapPin className="h-3.5 w-3.5" /> Billing Address</h4>
                                            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-300 space-y-1">
                                                <p className="font-medium">{selectedCustomer.billing_street || selectedCustomer.address || 'Not provided'}</p>
                                                {(selectedCustomer.billing_city || selectedCustomer.city) && <p>{selectedCustomer.billing_city || selectedCustomer.city}, {selectedCustomer.billing_state || selectedCustomer.state}</p>}
                                                {(selectedCustomer.billing_country || selectedCustomer.country) && <p>{selectedCustomer.billing_country || selectedCustomer.country}</p>}
                                            </div>
                                        </div>
                                        <div><h4 className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 border-b border-slate-100 dark:border-slate-800 pb-2"><CreditCard className="h-3.5 w-3.5" /> Preferences</h4>
                                            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-3">
                                                <div className="flex justify-between text-sm"><span className="text-slate-500">Currency</span><span className="font-semibold text-slate-900 dark:text-white uppercase">{selectedCustomer.default_currency || 'Default'}</span></div>
                                                <div className="flex justify-between text-sm"><span className="text-slate-500">Language</span><span className="font-medium text-slate-900 dark:text-white capitalize">{selectedCustomer.default_language || 'System Default'}</span></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                {selectedCustomer.customfields?.length > 0 && (
                                    <div className="border-t border-slate-100 dark:border-slate-800 pt-6">
                                        <h4 className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-4"><ListTodo className="h-3.5 w-3.5" /> Custom Fields</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {selectedCustomer.customfields.map((cf: any, i: number) => (
                                                <div key={i} className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700 flex justify-between text-sm">
                                                    <span className="text-slate-500">{cf.label}</span>
                                                    <span className="font-semibold text-slate-900 dark:text-white">{cf.value || <span className="text-slate-400 italic">Empty</span>}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end shrink-0">
                            <button onClick={() => setSelectedCustomerId(null)} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-white rounded-xl font-bold transition-colors text-sm">Close</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
