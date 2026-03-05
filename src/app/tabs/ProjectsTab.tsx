"use client";

import { useState } from "react";
import { useGetProjectsQuery } from "@/lib/features/api/perfexApi";
import { Loader2, AlertCircle, Folder, CheckCircle2, X, CalendarDays, BarChart, DollarSign, Clock, MapPin, Building2, ListTodo } from "lucide-react";

export function ProjectsTab() {
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const { data: rawData, isLoading, error } = useGetProjectsQuery();

    const projects: any[] = Array.isArray(rawData) ? rawData : (rawData && Array.isArray((rawData as any).data) ? (rawData as any).data : []);

    // Find the currently selected project full details
    const selectedProject = selectedProjectId ? projects.find(p => p.id === selectedProjectId) : null;

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="h-10 w-10 text-indigo-500 animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center text-red-600">
                <AlertCircle className="h-12 w-12 mx-auto mb-4" />
                <h3 className="font-bold text-lg">Failed to load Projects</h3>
            </div>
        );
    }

    if (!projects?.length) {
        return <div className="text-center py-20 text-slate-500">No projects found.</div>;
    }

    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map((project) => (
                    <div
                        key={project.id}
                        onClick={() => setSelectedProjectId(project.id)}
                        className="group bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between cursor-pointer hover:shadow-xl hover:border-indigo-400 dark:hover:border-indigo-500 transition-all duration-300 relative overflow-hidden"
                    >
                        <div>
                            <div className="flex items-center gap-3 mb-4">
                                <div className={`p-2 rounded-lg transition-colors group-hover:scale-105 ${project.status === "4" ? "bg-emerald-100 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white" : "bg-indigo-100 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white"}`}>
                                    {project.status === "4" ? <CheckCircle2 className="h-5 w-5" /> : <Folder className="h-5 w-5" />}
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900 dark:text-white line-clamp-1">{project.name}</h3>
                                    <p className="text-xs text-slate-500 uppercase tracking-wide">Project #{project.id}</p>
                                </div>
                            </div>

                            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 line-clamp-2">
                                {project.description || 'No description available for this project.'}
                            </p>
                        </div>

                        <div className="flex flex-col gap-2 border-t border-slate-100 dark:border-slate-700 pt-4 text-xs font-medium">
                            <div className="flex justify-between items-center text-slate-500">
                                <span>Client ID</span>
                                <span className="text-slate-700 dark:text-slate-300">{project.clientid || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between items-center text-slate-500">
                                <span>Deadline</span>
                                <span className={new Date(project.deadline) < new Date() && project.status !== "4" ? "text-red-500 font-bold" : "text-slate-700 dark:text-slate-300"}>
                                    {project.deadline || 'No deadline'}
                                </span>
                            </div>
                            <div className="mt-3 bg-slate-100 dark:bg-slate-700/50 rounded-full h-1.5 w-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full ${project.status === "4" ? "bg-emerald-500" : "bg-indigo-500"}`}
                                    style={{ width: `${project.progress || 0}%` }}
                                />
                            </div>
                            <div className="text-right text-xs text-slate-400 font-bold tracking-tight mt-1">
                                {project.progress || 0}%
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Project Details Modal */}
            {selectedProjectId && selectedProject && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm transition-opacity">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">

                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 shrink-0">
                            <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                                <Folder className="h-5 w-5 text-indigo-500" />
                                Project Details
                            </h3>
                            <button onClick={() => setSelectedProjectId(null)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors flex flex-col items-center justify-center h-9 w-9">
                                <X className="h-5 w-5 text-slate-500" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 md:p-8 overflow-y-auto">
                            <div className="space-y-8">

                                {/* Header Section */}
                                <div className="flex flex-col sm:flex-row gap-6 items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-8">
                                    <div>
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                                                ID: {selectedProject.id}
                                            </span>
                                            {selectedProject.status === "4" && (
                                                <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                                    <CheckCircle2 className="h-3.5 w-3.5" /> Finished
                                                </span>
                                            )}
                                        </div>
                                        <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white leading-tight">
                                            {selectedProject.name}
                                        </h2>
                                        <p className="text-slate-500 font-medium mt-1">Client #{selectedProject.clientid}</p>
                                    </div>
                                    <div className="flex flex-col items-end gap-2 shrink-0 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
                                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Overall Progress</p>
                                        <div className="flex items-end gap-2 text-indigo-600 dark:text-indigo-400">
                                            <span className="text-4xl font-black">{selectedProject.progress || 0}</span>
                                            <span className="text-xl font-bold pb-1">%</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Description */}
                                {selectedProject.description && (
                                    <div>
                                        <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3">Project Description</h4>
                                        <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">
                                            {selectedProject.description}
                                        </div>
                                    </div>
                                )}

                                {/* Metrics Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-5">
                                        <div className="flex items-start gap-4">
                                            <div className="bg-indigo-50 dark:bg-indigo-500/10 p-2.5 rounded-xl text-indigo-600 dark:text-indigo-400 shrink-0">
                                                <CalendarDays className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Timeline</p>
                                                <div className="flex flex-col text-sm text-slate-700 dark:text-slate-200 font-medium gap-1">
                                                    <span>Started: {selectedProject.start_date || 'N/A'}</span>
                                                    <span>Deadline: <span className={new Date(selectedProject.deadline) < new Date() && selectedProject.status !== "4" ? "text-red-500 dark:text-red-400 font-bold" : ""}>{selectedProject.deadline || 'N/A'}</span></span>
                                                    {selectedProject.date_finished && <span className="text-emerald-600 dark:text-emerald-400">Finished: {selectedProject.date_finished}</span>}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-start gap-4">
                                            <div className="bg-indigo-50 dark:bg-indigo-500/10 p-2.5 rounded-xl text-indigo-600 dark:text-indigo-400 shrink-0">
                                                <BarChart className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Status Breakdown</p>
                                                <p className="text-sm text-slate-700 dark:text-slate-200 font-medium capitalize">
                                                    {selectedProject.status === "1" && "Not Started"}
                                                    {selectedProject.status === "2" && "In Progress"}
                                                    {selectedProject.status === "3" && "On Hold"}
                                                    {selectedProject.status === "4" && "Cancelled"}
                                                    {selectedProject.status === "5" && "Finished"}
                                                    {!["1", "2", "3", "4", "5"].includes(selectedProject.status) && `Status Code ${selectedProject.status}`}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-5">
                                        <div className="flex items-start gap-4">
                                            <div className="bg-indigo-50 dark:bg-indigo-500/10 p-2.5 rounded-xl text-indigo-600 dark:text-indigo-400 shrink-0">
                                                <DollarSign className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Billing & Value</p>
                                                <div className="flex flex-col text-sm text-slate-700 dark:text-slate-200 font-medium gap-1">
                                                    <span>Type: {selectedProject.billing_type === "1" ? "Fixed Rate" : selectedProject.billing_type === "2" ? "Project Hours" : "Task Hours"}</span>
                                                    {Number(selectedProject.project_cost) > 0 && <span>Total Cost: ${Number(selectedProject.project_cost).toFixed(2)}</span>}
                                                    {Number(selectedProject.project_rate_per_hour) > 0 && <span>Hourly Rate: ${Number(selectedProject.project_rate_per_hour).toFixed(2)}</span>}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-start gap-4">
                                            <div className="bg-indigo-50 dark:bg-indigo-500/10 p-2.5 rounded-xl text-indigo-600 dark:text-indigo-400 shrink-0">
                                                <Clock className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Time Estimates</p>
                                                <p className="text-sm text-slate-700 dark:text-slate-200 font-medium">
                                                    {selectedProject.estimated_hours ? `${selectedProject.estimated_hours} Hours Allocated` : 'No estimate defined'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Custom Fields & Client Data Grid */}
                                {(selectedProject.customfields?.length > 0 || selectedProject.client_data) && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-slate-100 dark:border-slate-800 pt-8 mt-4">

                                        {/* Left: Custom Fields */}
                                        {selectedProject.customfields?.length > 0 && (
                                            <div>
                                                <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-4">
                                                    <ListTodo className="h-4 w-4 text-indigo-500" /> Custom Fields
                                                </h4>
                                                <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-3">
                                                    {selectedProject.customfields.map((cf: any, i: number) => (
                                                        <div key={i} className="flex justify-between items-start text-sm border-b last:border-0 border-slate-200 dark:border-slate-700 pb-2 last:pb-0">
                                                            <span className="text-slate-500">{cf.label}</span>
                                                            <span className="font-semibold text-slate-900 dark:text-white text-right max-w-[60%] break-words">
                                                                {cf.value || <span className="text-slate-400 font-normal italic">Empty</span>}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Right: Client Data Snapshot */}
                                        {selectedProject.client_data && (
                                            <div>
                                                <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-4">
                                                    <Building2 className="h-4 w-4 text-indigo-500" /> Client Data
                                                </h4>
                                                <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-10 w-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center shrink-0">
                                                            <Building2 className="h-5 w-5" />
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-slate-900 dark:text-white">{selectedProject.client_data.company}</p>
                                                            <p className="text-xs text-slate-500 uppercase tracking-wide">Client #{selectedProject.client_data.userid}</p>
                                                        </div>
                                                    </div>

                                                    {selectedProject.client_data.address && (
                                                        <div className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300 pt-3 border-t border-slate-200 dark:border-slate-700">
                                                            <MapPin className="h-4 w-4 shrink-0 text-slate-400 mt-0.5" />
                                                            <div>
                                                                <p className="font-medium">{selectedProject.client_data.address}</p>
                                                                {(selectedProject.client_data.city || selectedProject.client_data.state) && (
                                                                    <p>{selectedProject.client_data.city}, {selectedProject.client_data.state} {selectedProject.client_data.zip}</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end shrink-0">
                            <button
                                onClick={() => setSelectedProjectId(null)}
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
