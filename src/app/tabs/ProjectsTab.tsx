"use client";

import { useState } from "react";
import { useGetProjectsQuery } from "@/lib/features/api/perfexApi";
import { Loader2, AlertCircle, Folder, CheckCircle2, X, CalendarDays, BarChart, DollarSign, Clock, MapPin, Building2, ListTodo, Search } from "lucide-react";

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
    "1": { label: "Not Started", cls: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300" },
    "2": { label: "In Progress", cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400" },
    "3": { label: "On Hold", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400" },
    "4": { label: "Cancelled", cls: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400" },
    "5": { label: "Finished", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" },
};

export function ProjectsTab() {
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const { data: rawData, isLoading, error } = useGetProjectsQuery();

    const projects: any[] = Array.isArray(rawData) ? rawData : (rawData && Array.isArray((rawData as any).data) ? (rawData as any).data : []);
    const selectedProject = selectedProjectId ? projects.find(p => p.id === selectedProjectId) : null;

    const filtered = search.trim()
        ? projects.filter(p => `${p.name} ${p.description || ''}`.toLowerCase().includes(search.toLowerCase()))
        : projects;

    if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-10 w-10 text-brand-blue animate-spin" /></div>;
    if (error) return <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center text-red-600"><AlertCircle className="h-12 w-12 mx-auto mb-4" /><h3 className="font-bold text-lg">Failed to load Projects</h3></div>;

    return (
        <>
            {/* Search */}
            <div className="relative max-w-sm mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search projects…"
                    className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-blue"
                />
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 uppercase tracking-wider">
                                <th className="p-4">Project</th>
                                <th className="p-4">Client</th>
                                <th className="p-4">Deadline</th>
                                <th className="p-4">Progress</th>
                                <th className="p-4">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                            {!filtered.length ? (
                                <tr><td colSpan={5} className="text-center py-12 text-slate-400">{search ? `No projects matching "${search}".` : "No projects found."}</td></tr>
                            ) : filtered.map((project) => {
                                const statusInfo = STATUS_MAP[project.status] ?? { label: `Status ${project.status}`, cls: "bg-slate-100 text-slate-500" };
                                const isOverdue = project.deadline && new Date(project.deadline) < new Date() && project.status !== "5";
                                return (
                                    <tr
                                        key={project.id}
                                        onClick={() => setSelectedProjectId(project.id)}
                                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors group"
                                    >
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`h-9 w-9 rounded-xl flex items-center justify-center transition-colors ${project.status === "5" ? "bg-emerald-100 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white" : "bg-brand-blue-muted text-brand-blue group-hover:bg-brand-blue group-hover:text-white"}`}>
                                                    {project.status === "5" ? <CheckCircle2 className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-slate-900 dark:text-white group-hover:text-brand-blue dark:group-hover:text-brand-blue-light transition-colors line-clamp-1">{project.name}</p>
                                                    <p className="text-xs text-slate-400">#{project.id}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4 text-sm text-slate-600 dark:text-slate-300">{project.client_data?.company || (project.clientid ? `Client #${project.clientid}` : <span className="text-slate-400 italic">N/A</span>)}</td>
                                        <td className="p-4 text-sm">
                                            <span className={isOverdue ? "text-red-500 font-bold" : "text-slate-600 dark:text-slate-300"}>{project.deadline || 'No deadline'}</span>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2 min-w-[80px]">
                                                <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full h-1.5">
                                                    <div className={`h-full rounded-full ${project.status === "5" ? "bg-emerald-500" : "bg-brand-blue"}`} style={{ width: `${project.progress || 0}%` }} />
                                                </div>
                                                <span className="text-xs font-bold text-slate-500 w-8 text-right">{project.progress || 0}%</span>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${statusInfo.cls}`}>{statusInfo.label}</span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {filtered.length > 0 && (
                    <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-400 text-right">
                        {filtered.length} project{filtered.length !== 1 ? "s" : ""}
                    </div>
                )}
            </div>

            {/* Project Details Modal */}
            {selectedProjectId && selectedProject && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 shrink-0">
                            <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2"><Folder className="h-5 w-5 text-brand-blue" /> Project Details</h3>
                            <button onClick={() => setSelectedProjectId(null)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors"><X className="h-5 w-5 text-slate-500" /></button>
                        </div>
                        <div className="p-6 md:p-8 overflow-y-auto">
                            <div className="space-y-8">
                                <div className="flex flex-col sm:flex-row gap-6 items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-8">
                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-blue-muted text-brand-blue">ID: {selectedProject.id}</span>
                                            {selectedProject.status && <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${(STATUS_MAP[selectedProject.status] ?? STATUS_MAP["1"]).cls}`}>{(STATUS_MAP[selectedProject.status] ?? { label: "Unknown" }).label}</span>}
                                        </div>
                                        <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white">{selectedProject.name}</h2>
                                        <p className="text-slate-500 mt-1">{selectedProject.client_data?.company || `Client #${selectedProject.clientid}`}</p>
                                    </div>
                                    <div className="shrink-0 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 text-center">
                                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Progress</p>
                                        <span className="text-4xl font-black text-brand-blue dark:text-brand-blue-light">{selectedProject.progress || 0}<span className="text-xl font-bold">%</span></span>
                                    </div>
                                </div>
                                {selectedProject.description && (
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Description</h4>
                                        <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm whitespace-pre-wrap">{selectedProject.description}</div>
                                    </div>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-5">
                                        <div className="flex items-start gap-4"><div className="bg-brand-blue-muted p-2.5 rounded-xl text-brand-blue shrink-0"><CalendarDays className="h-5 w-5" /></div><div><p className="text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">Timeline</p><div className="text-sm text-slate-700 dark:text-slate-200 space-y-1"><span className="block">Started: {selectedProject.start_date || 'N/A'}</span><span className="block">Deadline: <span className={new Date(selectedProject.deadline) < new Date() && selectedProject.status !== "5" ? "text-red-500 font-bold" : ""}>{selectedProject.deadline || 'N/A'}</span></span>{selectedProject.date_finished && <span className="block text-emerald-600">Finished: {selectedProject.date_finished}</span>}</div></div></div>
                                        <div className="flex items-start gap-4"><div className="bg-brand-blue-muted p-2.5 rounded-xl text-brand-blue shrink-0"><DollarSign className="h-5 w-5" /></div><div><p className="text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">Billing</p><div className="text-sm text-slate-700 dark:text-slate-200 space-y-1"><span className="block">Type: {selectedProject.billing_type === "1" ? "Fixed" : selectedProject.billing_type === "2" ? "Project Hours" : "Task Hours"}</span>{Number(selectedProject.project_cost) > 0 && <span className="block">Total: ${Number(selectedProject.project_cost).toFixed(2)}</span>}</div></div></div>
                                    </div>
                                    <div className="space-y-5">
                                        <div className="flex items-start gap-4"><div className="bg-brand-blue-muted p-2.5 rounded-xl text-brand-blue shrink-0"><Clock className="h-5 w-5" /></div><div><p className="text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">Time</p><p className="text-sm text-slate-700 dark:text-slate-200">{selectedProject.estimated_hours ? `${selectedProject.estimated_hours} hrs allocated` : 'No estimate'}</p></div></div>
                                        {selectedProject.client_data && (
                                            <div className="flex items-start gap-4"><div className="bg-brand-blue-muted p-2.5 rounded-xl text-brand-blue shrink-0"><Building2 className="h-5 w-5" /></div><div><p className="text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">Client</p><p className="text-sm font-semibold text-slate-900 dark:text-white">{selectedProject.client_data.company}</p>{selectedProject.client_data.address && <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" />{selectedProject.client_data.city}, {selectedProject.client_data.country}</p>}</div></div>
                                        )}
                                    </div>
                                </div>
                                {selectedProject.customfields?.length > 0 && (
                                    <div className="border-t border-slate-100 dark:border-slate-800 pt-6">
                                        <h4 className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-4"><ListTodo className="h-3.5 w-3.5" /> Custom Fields</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {selectedProject.customfields.map((cf: any, i: number) => (
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
                            <button onClick={() => setSelectedProjectId(null)} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-white rounded-xl font-bold transition-colors text-sm">Close</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
