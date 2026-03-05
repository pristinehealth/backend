"use client";

import { useState } from "react";
import { useGetStaffQuery, useGetStaffByIdQuery } from "@/lib/features/api/perfexApi";
import { Mail, Phone, AlertCircle, Loader2, X, Briefcase, CalendarDays, Fingerprint, ListTodo } from "lucide-react";

export function StaffTab() {
    const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);

    const { data: rawData, isLoading, error: rtkError } = useGetStaffQuery();
    const { data: rawDetails, isLoading: detailsLoading } = useGetStaffByIdQuery(selectedStaffId as string, {
        skip: !selectedStaffId
    });

    const staffList: any[] = Array.isArray(rawData) ? rawData : (rawData && Array.isArray(rawData.data) ? rawData.data : []);
    const staffDetails = rawDetails && !Array.isArray(rawDetails) ? rawDetails : null;

    const error = rtkError ? "API Error" : null;

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="h-10 w-10 text-indigo-500 animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-2xl p-8 text-center text-red-600">
                <AlertCircle className="h-12 w-12 mx-auto mb-4" />
                <h3 className="font-bold text-lg">Failed to load Staff</h3>
            </div>
        );
    }

    if (!staffList?.length) {
        return <div className="text-center py-20 text-slate-500">No staff members found.</div>;
    }

    return (
        <>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Staff Directory</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {staffList.map((staff) => (
                    <div
                        key={staff.staffid}
                        onClick={() => setSelectedStaffId(staff.staffid)}
                        className="group relative bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500"
                    >
                        <div className="p-6">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="h-16 w-16 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-2xl shadow-inner group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
                                    {staff.firstname?.[0]}
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900 dark:text-white line-clamp-1">{staff.firstname} {staff.lastname}</h2>
                                    <p className="text-sm font-medium text-slate-500">#{staff.staffid}</p>
                                </div>
                            </div>
                            <div className="space-y-3 mb-8">
                                <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                                    <Mail className="h-4 w-4 shrink-0" /> <span className="truncate">{staff.email || 'N/A'}</span>
                                </div>
                                <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                                    <Phone className="h-4 w-4 shrink-0" /> <span>{staff.phonenumber || 'N/A'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Staff Details Modal */}
            {selectedStaffId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm transition-opacity">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">

                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
                            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Staff Details</h3>
                            <button onClick={() => setSelectedStaffId(null)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
                                <X className="h-5 w-5 text-slate-500" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6">
                            {detailsLoading ? (
                                <div className="flex py-20 justify-center">
                                    <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                                </div>
                            ) : staffDetails ? (
                                <div className="space-y-6">
                                    <div className="flex items-center gap-6 pb-6 border-b border-slate-100 dark:border-slate-800">
                                        <div className="h-24 w-24 shrink-0 rounded-3xl bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-4xl shadow-inner">
                                            {staffDetails.firstname?.[0]}
                                        </div>
                                        <div>
                                            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white">{staffDetails.firstname} {staffDetails.lastname}</h2>
                                            <span className="inline-flex mt-2 items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700">
                                                <Fingerprint className="h-3 w-3" /> ID: {staffDetails.staffid}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                                                <Mail className="h-5 w-5 text-slate-400 shrink-0" />
                                                <div>
                                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">Email</p>
                                                    <p className="font-medium break-all">{staffDetails.email || 'Not provided'}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                                                <Phone className="h-5 w-5 text-slate-400 shrink-0" />
                                                <div>
                                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">Phone Number</p>
                                                    <p className="font-medium">{staffDetails.phonenumber || 'Not provided'}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                                                <Briefcase className="h-5 w-5 text-slate-400 shrink-0" />
                                                <div>
                                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">Language</p>
                                                    <p className="font-medium capitalize">{staffDetails.default_language || 'System Default'}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                                                <CalendarDays className="h-5 w-5 text-slate-400 shrink-0" />
                                                <div>
                                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">Date Created</p>
                                                    <p className="font-medium">{staffDetails.datecreated?.split(' ')[0] || 'Unknown'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Custom Fields Section */}
                                    {staffDetails.customfields?.length > 0 && (
                                        <div className="border-t border-slate-100 dark:border-slate-800 pt-6 mt-6">
                                            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-4">
                                                <ListTodo className="h-4 w-4 text-indigo-500" /> Custom Fields
                                            </h4>
                                            <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-700">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                                                    {staffDetails.customfields.map((cf: any, i: number) => (
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
                            ) : (
                                <div className="text-center py-10 text-slate-500">Failed to load detailed profile.</div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                            <button
                                onClick={() => setSelectedStaffId(null)}
                                className="px-6 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-white rounded-xl font-bold transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
