"use client";

import { useGetContactsQuery } from "@/lib/features/api/perfexApi";
import { Loader2, AlertCircle, UsersRound, Phone, Mail } from "lucide-react";

export function ContactsTab() {
    const { data: rawData, isLoading, error: rtkError } = useGetContactsQuery();

    const contactList: any[] = Array.isArray(rawData) ? rawData : (rawData && Array.isArray(rawData.data) ? rawData.data : []);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="h-10 w-10 text-brand-blue-light animate-spin" />
            </div>
        );
    }

    if (rtkError) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center text-red-600">
                <AlertCircle className="h-12 w-12 mx-auto mb-4" />
                <h3 className="font-bold text-lg">Failed to load Contacts</h3>
            </div>
        );
    }

    if (!contactList?.length) {
        return <div className="text-center py-20 text-slate-500">No contacts found.</div>;
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {contactList.map((contact) => (
                <div key={contact.id} className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-start gap-4">
                    <div className="bg-emerald-100 p-3 rounded-full text-emerald-600 shrink-0">
                        <UsersRound className="h-6 w-6" />
                    </div>
                    <div className="overflow-hidden">
                        <h3 className="font-bold text-lg text-slate-900 dark:text-white truncate">{contact.firstname} {contact.lastname}</h3>
                        <p className="text-sm font-medium text-slate-500 mb-3">{contact.title || 'Contact'}</p>
                        {contact.email && (
                            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 mb-1 w-full">
                                <Mail className="h-4 w-4 shrink-0" /> <span className="truncate">{contact.email}</span>
                            </div>
                        )}
                        {contact.phonenumber && (
                            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 w-full">
                                <Phone className="h-4 w-4 shrink-0" /> <span className="truncate">{contact.phonenumber}</span>
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
