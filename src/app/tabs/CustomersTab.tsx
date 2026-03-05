"use client";

import { useState } from "react";
import { useGetCustomersQuery } from "@/lib/features/api/perfexApi";
import { Loader2, AlertCircle, Building2, MapPin, X, Phone, Globe, Hash, CreditCard, ListTodo } from "lucide-react";

export function CustomersTab() {
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
    const { data: rawData, isLoading, error: rtkError } = useGetCustomersQuery();

    const customerList: any[] = Array.isArray(rawData) ? rawData : (rawData && Array.isArray((rawData as any).data) ? (rawData as any).data : []);

    // Find the currently selected customer full details
    const selectedCustomer = selectedCustomerId ? customerList.find(c => c.userid === selectedCustomerId) : null;

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="h-10 w-10 text-indigo-500 animate-spin" />
            </div>
        );
    }

    if (rtkError) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center text-red-600">
                <AlertCircle className="h-12 w-12 mx-auto mb-4" />
                <h3 className="font-bold text-lg">Failed to load Customers</h3>
            </div>
        );
    }

    if (!customerList?.length) {
        return <div className="text-center py-20 text-slate-500">No customers found.</div>;
    }

    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {customerList.map((customer) => (
                    <div
                        key={customer.userid}
                        onClick={() => setSelectedCustomerId(customer.userid)}
                        className="group bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm cursor-pointer hover:shadow-xl hover:border-indigo-400 dark:hover:border-indigo-500 transition-all duration-300 relative overflow-hidden"
                    >
                        <div className="flex items-start gap-4 mb-4">
                            <div className="bg-blue-100 p-3 rounded-xl text-blue-600 transition-transform group-hover:scale-105 group-hover:bg-blue-600 group-hover:text-white">
                                <Building2 className="h-6 w-6" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-1">{customer.company}</h3>
                                <p className="text-sm font-medium text-slate-500 mt-0.5">ID: {customer.userid}</p>
                            </div>
                        </div>
                        {customer.address && (
                            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 mt-4 border-t border-slate-100 dark:border-slate-700 pt-4">
                                <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                                <span className="truncate">{customer.city}, {customer.country}</span>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Customer Details Modal */}
            {selectedCustomerId && selectedCustomer && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm transition-opacity">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">

                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 shrink-0">
                            <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                                <Building2 className="h-5 w-5 text-indigo-500" />
                                Customer Details
                            </h3>
                            <button onClick={() => setSelectedCustomerId(null)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors flex flex-col items-center justify-center h-9 w-9">
                                <X className="h-5 w-5 text-slate-500" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 md:p-8 overflow-y-auto">
                            <div className="space-y-8">

                                {/* Header Section */}
                                <div className="border-b border-slate-100 dark:border-slate-800 pb-8 flex flex-col gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-16 w-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center shrink-0">
                                            <Building2 className="h-8 w-8" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                                                    ID: {selectedCustomer.userid}
                                                </span>
                                                {selectedCustomer.active === "1" && (
                                                    <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                                        Active
                                                    </span>
                                                )}
                                            </div>
                                            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white leading-tight">
                                                {selectedCustomer.company}
                                            </h2>
                                        </div>
                                    </div>
                                </div>

                                {/* Main Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                                    {/* Left Column (Contact & Meta) */}
                                    <div className="space-y-6">

                                        <div>
                                            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
                                                <Hash className="h-4 w-4 text-slate-400" /> Identification
                                            </h4>
                                            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-3">
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-slate-500">VAT Number</span>
                                                    <span className="font-semibold text-slate-900 dark:text-white">{selectedCustomer.vat || 'N/A'}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-slate-500">Customer Group</span>
                                                    <span className="font-semibold text-slate-900 dark:text-white">{selectedCustomer.groups || 'None'}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-slate-500">Date Created</span>
                                                    <span className="font-medium text-slate-900 dark:text-white">{selectedCustomer.datecreated || 'Unknown'}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
                                                <Phone className="h-4 w-4 text-slate-400" /> Contact Details
                                            </h4>
                                            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-3">
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-slate-500">Phone</span>
                                                    <span className="font-semibold text-slate-900 dark:text-white">{selectedCustomer.phonenumber || 'N/A'}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-slate-500">Website</span>
                                                    <span className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer truncate max-w-[200px] text-right">
                                                        {selectedCustomer.website || 'N/A'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
                                                <CreditCard className="h-4 w-4 text-slate-400" /> Preferences
                                            </h4>
                                            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-3">
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-slate-500">Currency</span>
                                                    <span className="font-semibold text-slate-900 dark:text-white uppercase">{selectedCustomer.default_currency || 'Default'}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-slate-500">Language</span>
                                                    <span className="font-medium text-slate-900 dark:text-white capitalize">{selectedCustomer.default_language || 'System Default'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Column (Addresses) */}
                                    <div className="space-y-6">
                                        <div>
                                            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
                                                <MapPin className="h-4 w-4 text-slate-400" /> Billing Address
                                            </h4>
                                            <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 flex items-start gap-4">
                                                <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-400 shrink-0">
                                                    <Building2 className="h-5 w-5" />
                                                </div>
                                                <div className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                                                    <p className="font-medium text-slate-900 dark:text-white">{selectedCustomer.billing_street || selectedCustomer.address || 'Address not provided'}</p>
                                                    {(selectedCustomer.billing_city || selectedCustomer.city) && <p>{selectedCustomer.billing_city || selectedCustomer.city}, {selectedCustomer.billing_state || selectedCustomer.state} {selectedCustomer.billing_zip || selectedCustomer.zip}</p>}
                                                    {(selectedCustomer.billing_country || selectedCustomer.country) && <p>{selectedCustomer.billing_country || selectedCustomer.country}</p>}
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
                                                <Globe className="h-4 w-4 text-slate-400" /> Shipping Address
                                            </h4>
                                            <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 flex items-start gap-4">
                                                <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-400 shrink-0">
                                                    <MapPin className="h-5 w-5" />
                                                </div>
                                                <div className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                                                    <p className="font-medium text-slate-900 dark:text-white">{selectedCustomer.shipping_street || 'Same as billing'}</p>
                                                    {selectedCustomer.shipping_city && <p>{selectedCustomer.shipping_city}, {selectedCustomer.shipping_state} {selectedCustomer.shipping_zip}</p>}
                                                    {selectedCustomer.shipping_country && <p>{selectedCustomer.shipping_country}</p>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                </div>

                                {/* Custom Fields Section (Full Width below) */}
                                {selectedCustomer.customfields?.length > 0 && (
                                    <div className="border-t border-slate-100 dark:border-slate-800 pt-8 mt-4">
                                        <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-4">
                                            <ListTodo className="h-4 w-4 text-indigo-500" /> Custom Fields
                                        </h4>
                                        <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-700">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                                                {selectedCustomer.customfields.map((cf: any, i: number) => (
                                                    <div key={i} className="flex justify-between items-start text-sm border-b md:border-b-0 md:border-r last:border-0 md:even:border-r-0 border-slate-200 dark:border-slate-700 pb-2 md:pb-0 md:pr-4">
                                                        <span className="text-slate-500">{cf.label}</span>
                                                        <span className="font-semibold text-slate-900 dark:text-white text-right max-w-[60%] break-words">
                                                            {cf.value || <span className="text-slate-400 font-normal italic">Empty</span>}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end shrink-0">
                            <button
                                onClick={() => setSelectedCustomerId(null)}
                                className="px-6 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-white rounded-xl font-bold transition-colors"
                            >
                                Close View
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
