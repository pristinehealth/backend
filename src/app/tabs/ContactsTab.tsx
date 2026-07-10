"use client";

import { useGetContactsQuery } from "@/lib/features/api/perfexApi";
import { Loader2, AlertCircle, UsersRound, Phone, Mail } from "lucide-react";

export function ContactsTab() {
    const { data: rawData, isLoading, error: rtkError } = useGetContactsQuery();

    const contactList: any[] = Array.isArray(rawData) ? rawData : (rawData && Array.isArray(rawData.data) ? rawData.data : []);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="h-10 w-10 text-cyan-500 animate-spin" />
            </div>
        );
    }

    if (rtkError) {
        return (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-8 text-center text-rose-400">
                <AlertCircle className="h-12 w-12 mx-auto mb-4" />
                <h3 className="font-bold text-lg">Failed to load Contacts</h3>
            </div>
        );
    }

    if (!contactList?.length) {
        return <div className="text-center py-20 text-slate-500">No contacts found.</div>;
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {contactList.map((contact) => (
                <div 
                    key={contact.id} 
                    className="bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-5 rounded-2xl border border-white/[0.06] hover:border-cyan-500/30 transition-all shadow-md flex items-start gap-4 group"
                >
                    <div className="bg-cyan-500/10 border border-cyan-500/20 p-2.5 rounded-xl text-cyan-400 shrink-0 group-hover:bg-cyan-500 group-hover:text-white transition-all">
                        <UsersRound className="h-5 w-5" />
                    </div>
                    <div className="overflow-hidden">
                        <h3 className="font-semibold text-base text-slate-200 group-hover:text-cyan-400 transition-colors truncate">{contact.firstname} {contact.lastname}</h3>
                        <p className="text-xs font-semibold text-slate-500 mb-3">{contact.title || 'Contact'}</p>
                        {contact.email && (
                            <div className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-300 transition-colors mb-1.5 w-full">
                                <Mail className="h-4 w-4 shrink-0 text-slate-500" /> 
                                <span className="truncate">{contact.email}</span>
                            </div>
                        )}
                        {contact.phonenumber && (
                            <div className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-300 transition-colors w-full">
                                <Phone className="h-4 w-4 shrink-0 text-slate-500" /> 
                                <span className="truncate">{contact.phonenumber}</span>
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
