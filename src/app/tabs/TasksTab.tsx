"use client";

import { useState } from "react";
import { useGetTasksQuery } from "@/lib/features/api/perfexApi";
import { Loader2, AlertCircle, ClipboardList, CheckCircle2, X, CalendarDays, BarChart, FileText, Flag, Link as LinkIcon, DollarSign, Folder, ListTodo, ListChecks, Clock } from "lucide-react";

export function TasksTab() {
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const { data: rawData, isLoading, error: rtkError } = useGetTasksQuery();

    const taskList: any[] = Array.isArray(rawData) ? rawData : (rawData && Array.isArray((rawData as any).data) ? (rawData as any).data : []);

    // Find the currently selected task full details
    const selectedTask = selectedTaskId ? taskList.find(t => t.id === selectedTaskId) : null;

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
                <h3 className="font-bold text-lg">Failed to load Tasks</h3>
            </div>
        );
    }

    if (!taskList?.length) {
        return <div className="text-center py-20 text-slate-500">No tasks found.</div>;
    }

    const stripHtml = (html: string) => {
        if (!html) return '';
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return doc.body.textContent || "";
    };

    return (
        <div className="space-y-4">
            {taskList.map((task) => (
                <div
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    className="group bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between gap-4 cursor-pointer hover:shadow-md hover:border-indigo-400 dark:hover:border-indigo-500 transition-all duration-200"
                >
                    <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-full transition-colors group-hover:scale-105 ${task.status === "5" ? "bg-emerald-100 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white" : "bg-amber-100 text-amber-600 group-hover:bg-amber-600 group-hover:text-white"}`}>
                            {task.status === "5" ? <CheckCircle2 className="h-5 w-5" /> : <ClipboardList className="h-5 w-5" />}
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900 dark:text-white line-clamp-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{task.name}</h3>
                            <div className="flex items-center gap-4 text-sm text-slate-500 mt-1">
                                <span>Priority: {task.priority === "1" ? "Low" : task.priority === "2" ? "Medium" : task.priority === "3" ? "High" : task.priority === "4" ? "Urgent" : task.priority || 'Normal'}</span>
                                <span className={new Date(task.duedate) < new Date() && task.status !== "5" ? "text-red-500 font-medium" : ""}>
                                    Due: {task.duedate || 'N/A'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 group-hover:bg-slate-200 dark:group-hover:bg-slate-600 transition-colors shrink-0">
                        {task.status === "5" ? "Completed" : "Active"}
                    </div>
                </div>
            ))}

            {/* Task Details Modal */}
            {selectedTaskId && selectedTask && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm transition-opacity">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">

                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 shrink-0">
                            <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                                <ClipboardList className="h-5 w-5 text-indigo-500" />
                                Task Details
                            </h3>
                            <button onClick={() => setSelectedTaskId(null)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors flex flex-col items-center justify-center h-9 w-9">
                                <X className="h-5 w-5 text-slate-500" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 md:p-8 overflow-y-auto">
                            <div className="space-y-8">

                                {/* Header Section */}
                                <div className="border-b border-slate-100 dark:border-slate-800 pb-8 flex flex-col gap-4">
                                    <div className="flex items-center gap-3">
                                        <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                                            Task #{selectedTask.id}
                                        </span>
                                        {selectedTask.status === "5" && (
                                            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                                <CheckCircle2 className="h-3.5 w-3.5" /> Completed
                                            </span>
                                        )}
                                        {selectedTask.billed === "1" && (
                                            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                                Billed
                                            </span>
                                        )}
                                    </div>
                                    <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white leading-tight">
                                        {selectedTask.name}
                                    </h2>
                                </div>

                                {/* Main Grid */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                                    {/* Left Column (Details) */}
                                    <div className="lg:col-span-2 space-y-8">

                                        {/* Description */}
                                        <div>
                                            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
                                                <FileText className="h-4 w-4 text-slate-400" /> Description
                                            </h4>
                                            <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">
                                                {stripHtml(selectedTask.description) || 'No description provided.'}
                                            </div>
                                        </div>

                                        {/* Relations */}
                                        {selectedTask.rel_type && (
                                            <div>
                                                <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
                                                    <LinkIcon className="h-4 w-4 text-slate-400" /> Related To
                                                </h4>
                                                <div className="bg-slate-50 dark:bg-slate-800/50 px-5 py-4 rounded-2xl border border-slate-100 dark:border-slate-700 flex items-center gap-4">
                                                    <div className="bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-400">
                                                        <Folder className="h-5 w-5" />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-0.5">{selectedTask.rel_type}</p>
                                                        <p className="font-semibold text-slate-900 dark:text-white">
                                                            {selectedTask.rel_type === 'project' && selectedTask.project_data?.name
                                                                ? selectedTask.project_data.name
                                                                : `ID: ${selectedTask.rel_id}`}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Custom Fields List */}
                                        {selectedTask.customfields?.length > 0 && (
                                            <div>
                                                <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
                                                    <ListTodo className="h-4 w-4 text-slate-400" /> Custom Fields
                                                </h4>
                                                <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-3">
                                                    {selectedTask.customfields.map((cf: any, i: number) => (
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

                                        {/* Checklist */}
                                        {selectedTask.checklist_items?.length > 0 && (
                                            <div>
                                                <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
                                                    <ListChecks className="h-4 w-4 text-slate-400" /> Checklist
                                                </h4>
                                                <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-2">
                                                    {selectedTask.checklist_items.map((item: any) => (
                                                        <div key={item.id} className="flex items-center gap-3 text-sm">
                                                            <div className={`h-4 w-4 rounded-full flex items-center justify-center border shrink-0 ${item.finished === "1" ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 dark:border-slate-600"}`}>
                                                                {item.finished === "1" && <CheckCircle2 className="h-3 w-3" />}
                                                            </div>
                                                            <span className={`font-medium ${item.finished === "1" ? "text-slate-400 dark:text-slate-500 line-through" : "text-slate-700 dark:text-slate-200"}`}>
                                                                {item.description}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>


                                </div>

                                {/* Right Column (Meta info cards) */}
                                <div className="space-y-4">
                                    {/* Card 1: Status & Priority */}
                                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
                                        <div className="flex items-center gap-3 mb-3 pb-3 border-b border-slate-200 dark:border-slate-700">
                                            <BarChart className="h-4 w-4 text-slate-400" />
                                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Status</span>
                                        </div>
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-slate-500">State</span>
                                                <span className="font-semibold text-slate-900 dark:text-white capitalize">
                                                    {selectedTask.status === "1" && "Not Started"}
                                                    {selectedTask.status === "2" && "Awaiting Feedback"}
                                                    {selectedTask.status === "3" && "Testing"}
                                                    {selectedTask.status === "4" && "In Progress"}
                                                    {selectedTask.status === "5" && "Complete"}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-slate-500">Priority</span>
                                                <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                                                    <Flag className={`h-3 w-3 ${selectedTask.priority === "4" ? "text-red-500" : selectedTask.priority === "3" ? "text-orange-500" : "text-sky-500"}`} />
                                                    {selectedTask.priority === "1" ? "Low" : selectedTask.priority === "2" ? "Medium" : selectedTask.priority === "3" ? "High" : selectedTask.priority === "4" ? "Urgent" : selectedTask.priority || "Normal"}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Card 2: Timeline */}
                                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
                                        <div className="flex items-center gap-3 mb-3 pb-3 border-b border-slate-200 dark:border-slate-700">
                                            <CalendarDays className="h-4 w-4 text-slate-400" />
                                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Timeline</span>
                                        </div>
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-slate-500">Started</span>
                                                <span className="font-medium text-slate-900 dark:text-white">{selectedTask.startdate || 'N/A'}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-slate-500">Deadline</span>
                                                <span className={`font-medium ${new Date(selectedTask.duedate) < new Date() && selectedTask.status !== "5" ? "text-red-600 dark:text-red-400 font-bold" : "text-slate-900 dark:text-white"}`}>
                                                    {selectedTask.duedate || 'N/A'}
                                                </span>
                                            </div>
                                            {selectedTask.datefinished && (
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-slate-500">Finished</span>
                                                    <span className="font-medium text-emerald-600 dark:text-emerald-400">{selectedTask.datefinished}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Card 3: Financials (if exists) */}
                                    {Number(selectedTask.hourly_rate) > 0 && (
                                        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
                                            <div className="flex items-center gap-3 mb-3 pb-3 border-b border-slate-200 dark:border-slate-700">
                                                <DollarSign className="h-4 w-4 text-slate-400" />
                                                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Financials</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-slate-500">Hourly Rate</span>
                                                <span className="font-semibold text-slate-900 dark:text-white">
                                                    ${Number(selectedTask.hourly_rate).toFixed(2)}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                            </div>

                            {/* Timesheet Ledger (Full Width Bottom Section) */}
                            {selectedTask.timesheets?.length > 0 && (
                                <div className="mt-10 pt-8 border-t border-slate-200 dark:border-slate-700">
                                    <h4 className="flex items-center gap-2 text-xl font-extrabold text-slate-900 dark:text-white mb-6">
                                        <Clock className="h-6 w-6 text-indigo-500" /> Shift Logs & Checklists
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {selectedTask.timesheets.map((ts: any) => (
                                            <div key={ts.id} className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col h-full hover:shadow-md transition-shadow">
                                                {/* Header */}
                                                <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-700 pb-4 mb-4">
                                                    <div>
                                                        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Caregiver</div>
                                                        <div className="font-bold text-slate-900 dark:text-white text-lg">
                                                            {ts.staff_name}
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-xs font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400 mb-1">
                                                            {new Date(Number(ts.start_time) * 1000).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                                                        </div>
                                                        <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-end gap-1.5">
                                                            {new Date(Number(ts.start_time) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            <span className="text-slate-400">→</span>
                                                            {ts.end_time ? (
                                                                <span>{new Date(Number(ts.end_time) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                            ) : (
                                                                <span className="text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded flex items-center gap-1">
                                                                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></div> Active
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                {/* Notes Body */}
                                                <div className="flex-1 bg-slate-50 dark:bg-slate-900/50 p-5 rounded-xl border border-slate-100 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-300 leading-loose whitespace-pre-wrap font-medium">
                                                    {ts.note ? ts.note.replace(/<[^>]+>/g, '').trim() : "No checkout notes provided."}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end shrink-0">
                            <button
                                onClick={() => setSelectedTaskId(null)}
                                className="px-6 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-white rounded-xl font-bold transition-colors"
                            >
                                Close View
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
