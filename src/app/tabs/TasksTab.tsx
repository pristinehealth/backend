"use client";

import { useState, useEffect } from "react";
import { useGetTasksQuery, useGetServiceReportsByTaskIdQuery } from "@/lib/features/api/perfexApi";
import {
    Loader2, AlertCircle, ClipboardList, CheckCircle2, X, CalendarDays, BarChart,
    FileText, Flag, Link as LinkIcon, Folder, ListTodo, ListChecks,
    Clock, ChevronLeft, ChevronRight, FileSignature, Download, Search, User, Users
} from "lucide-react";
import { downloadServiceReportPdf, toServiceReportPdfData } from "@/lib/pdf/serviceReport";

export function TasksTab() {
    const [page, setPage] = useState(1);
    const limit = 10;

    // Debounced staff search
    const [staffInput, setStaffInput] = useState("");
    const [staffSearch, setStaffSearch] = useState("");
    useEffect(() => {
        const t = setTimeout(() => { setStaffSearch(staffInput); setPage(1); }, 350);
        return () => clearTimeout(t);
    }, [staffInput]);

    // Date filter
    const [activeChip, setActiveChip] = useState<'today' | 'week' | ''>("");
    const [customDate, setCustomDate] = useState(""); // single day from the date picker

    const todayStr = new Date().toISOString().split('T')[0];
    const thisWeekStart = (() => {
        const d = new Date();
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        return d.toISOString().split('T')[0];
    })();
    const thisWeekEnd = (() => {
        const d = new Date();
        const day = d.getDay();
        const diff = day === 0 ? 0 : 7 - day;
        d.setDate(d.getDate() + diff);
        return d.toISOString().split('T')[0];
    })();

    const handleChip = (chip: 'today' | 'week') => {
        setActiveChip(prev => prev === chip ? '' : chip);
        setCustomDate('');
        setPage(1);
    };

    // Build query args based on active filter
    const dateQueryArgs = (() => {
        if (activeChip === 'today') return { dateFrom: todayStr, dateTo: todayStr };
        if (activeChip === 'week') return { dateFrom: thisWeekStart, dateTo: thisWeekEnd };
        if (customDate) return { date: customDate };
        return {};
    })();

    const { data: rawData, isLoading, error: rtkError, isFetching } = useGetTasksQuery(
        { page, limit, ...(staffSearch ? { staff: staffSearch } : {}), ...dateQueryArgs }
    );

    // PDF states
    const [isGeneratingPdf, setIsGeneratingPdf] = useState<Record<string, boolean>>({});
    const [pdfError, setPdfError] = useState<string | null>(null);

    const taskList: any[] = Array.isArray(rawData) ? rawData : (rawData?.data ?? []);
    const pagination = rawData?.pagination ?? null;

    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [showInstructions, setShowInstructions] = useState(false);
    const selectedTask = selectedTaskId ? taskList.find(t => t.id === selectedTaskId) : null;

    const { data: reportsData, isFetching: reportsFetching } = useGetServiceReportsByTaskIdQuery(
        selectedTaskId as string, { skip: !selectedTaskId }
    );
    const serviceReports = reportsData?.data || [];

    // Orchestration only: map the raw report → typed data and hand off to the
    // PDF generator (src/lib/pdf/serviceReport.ts). All layout lives there.
    const handleDownloadPDF = async (reportId: string) => {
        const sr = serviceReports.find((r: any) => r._id === reportId);
        if (!sr) return;
        setPdfError(null);
        setIsGeneratingPdf(prev => ({ ...prev, [reportId]: true }));
        try {
            await downloadServiceReportPdf(toServiceReportPdfData(sr, selectedTask));
        } catch (err: any) {
            console.error("[Service Report PDF] generation failed:", err?.message || err);
            setPdfError("Could not generate the PDF. Please try again.");
        } finally {
            setIsGeneratingPdf(prev => ({ ...prev, [reportId]: false }));
        }
    };

    const stripHtml = (html: string) => {
        if (!html) return '';
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return doc.body.textContent || "";
    };

    const priorityLabel = (p: string) =>
        p === "1" ? "Low" : p === "2" ? "Medium" : p === "3" ? "High" : p === "4" ? "Urgent" : p || "Normal";

    const statusLabel = (s: string) =>
        ({ "1": "Not Started", "2": "Awaiting Feedback", "3": "Testing", "4": "In Progress", "5": "Complete" }[s] ?? s);

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
                <h3 className="font-bold text-lg">Failed to load Tasks</h3>
            </div>
        );
    }

    return (
        <div className="space-y-4">

            {/* Filters Row */}
            <div className="flex flex-wrap gap-3 items-center">
                {/* Staff search */}
                <div className="relative w-full sm:w-auto">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                    <input
                        type="text"
                        value={staffInput}
                        onChange={e => setStaffInput(e.target.value)}
                        placeholder="Search by caregiver…"
                        className="pl-9 pr-4 py-2 rounded-xl border border-white/10 bg-black/40 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 outline-none w-full sm:w-52 transition-all"
                    />
                </div>

                {/* Date quick-chips */}
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Date:</span>
                    {([
                        { label: "Today", chip: 'today' as const },
                        { label: "This Week", chip: 'week' as const },
                    ]).map(({ label, chip }) => (
                        <button
                            key={chip}
                            onClick={() => handleChip(chip)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${activeChip === chip
                                ? "bg-teal-500 text-white border-teal-500/20 shadow-md shadow-teal-500/10"
                                : "bg-black/40 text-slate-400 border-white/10 hover:border-teal-500/30 hover:text-teal-400"
                                }`}
                        >
                            {label}
                        </button>
                    ))}
                    {/* Custom date picker */}
                    <input
                        type="date"
                        value={customDate}
                        onChange={e => { setCustomDate(e.target.value); setActiveChip(''); setPage(1); }}
                        className="px-3 py-1.5 rounded-xl border border-white/10 bg-black/40 text-xs text-slate-300 focus:border-teal-500 outline-none"
                    />
                    {(activeChip || customDate) && (
                        <button
                            onClick={() => { setActiveChip(''); setCustomDate(''); setPage(1); }}
                            className="flex items-center gap-1 px-2 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:text-rose-400 border border-white/10 hover:border-rose-500/20 transition-all"
                            title="Clear date filter"
                        >
                            <X className="h-3 w-3" /> Clear
                        </button>
                    )}
                </div>
            </div>

            {/* Main Table */}
            <div className="bg-gradient-to-b from-white/[0.04] to-white/[0.01] rounded-2xl border border-white/[0.06] overflow-hidden shadow-lg">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                        <thead>
                            <tr className="bg-white/[0.02] border-b border-white/[0.06] text-xs font-bold text-slate-400 uppercase tracking-wider">
                                <th className="p-4">ID</th>
                                <th className="p-4">Task Name</th>
                                <th className="p-4">
                                    <span className="flex items-center gap-1.5">
                                        <Users className="h-3.5 w-3.5" /> Assigned Staff
                                    </span>
                                </th>
                                <th className="p-4">Priority</th>
                                <th className="p-4">Deadline</th>
                                <th className="p-4">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04] relative">
                            {isFetching && (
                                <tr className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-10 flex items-center justify-center">
                                    <td className="w-full flex justify-center py-8"><Loader2 className="h-8 w-8 text-cyan-400 animate-spin" /></td>
                                </tr>
                            )}
                            {!taskList?.length ? (
                                <tr>
                                    <td colSpan={6} className="text-center py-12 text-slate-500">
                                        {staffSearch ? `No tasks found for caregiver "${staffSearch}".` : "No tasks found."}
                                    </td>
                                </tr>
                            ) : (
                                taskList.map((task) => (
                                    <tr
                                        key={task.id}
                                        onClick={() => { setSelectedTaskId(task.id); setShowInstructions(false); }}
                                        className="hover:bg-white/[0.02] cursor-pointer transition-colors group"
                                    >
                                        <td className="p-4 text-xs font-mono text-slate-500">#{task.id}</td>
                                        <td className="p-4">
                                            <div className="font-semibold text-slate-300 group-hover:text-cyan-400 transition-colors line-clamp-1">
                                                {task.name}
                                            </div>
                                            {task.project_data?.name && (
                                                <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
                                                    <Folder className="h-3 w-3" /> {task.project_data.name}
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            {task.assignedStaff?.length > 0 ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {task.assignedStaff.map((name: string) => (
                                                        <span key={name} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                                                            <User className="h-2.5 w-2.5" />{name}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-text-muted italic">Unassigned</span>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            <span className="flex items-center gap-1.5 text-xs text-slate-400 group-hover:text-slate-300">
                                                <Flag className={`h-3.5 w-3.5 ${task.priority === "4" ? "text-rose-500" : task.priority === "3" ? "text-amber-500" : "text-cyan-500"}`} />
                                                {priorityLabel(task.priority)}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <span className={`text-xs ${new Date(task.duedate) < new Date() && task.status !== "5" ? "text-rose-400 font-bold" : "text-slate-400 group-hover:text-slate-300"}`}>
                                                {task.duedate || 'N/A'}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            {task.status === "5" ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                                                    <CheckCircle2 className="h-3.5 w-3.5" /> Completed
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 border border-amber-500/20 text-amber-400">
                                                    Active
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {pagination && (pagination.totalPages > 1 || staffSearch) && (
                    <div className="p-4 border-t border-white/[0.04] flex items-center justify-between bg-white/[0.01]">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            {staffSearch
                                ? <><span className="text-slate-300">{pagination.total}</span> task{pagination.total !== 1 ? 's' : ''} for <span className="text-cyan-400">&quot;{staffSearch}&quot;</span>{pagination.totalPages > 1 && <> · Page <span className="text-slate-200">{pagination.page}</span> of <span className="text-slate-200">{pagination.totalPages}</span></>}</>
                                : <>Page <span className="text-slate-200">{pagination.page}</span> of <span className="text-slate-200">{pagination.totalPages}</span> <span className="ml-2 text-slate-500">({pagination.total} tasks)</span></>
                            }
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || isFetching} className="p-1.5 rounded-lg border border-white/10 bg-black/40 text-slate-300 disabled:opacity-50 hover:bg-white/[0.02] transition-colors flex items-center">
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <button onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={page === pagination.totalPages || isFetching} className="p-1.5 rounded-lg border border-white/10 bg-black/40 text-slate-300 disabled:opacity-50 hover:bg-white/[0.02] transition-colors flex items-center">
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Task Details Modal */}
            {selectedTaskId && selectedTask && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setSelectedTaskId(null); }}>
                    <div className="bg-surface-modal border border-border-modal w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] relative">
                        
                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-border-card flex items-center justify-between gap-4 bg-surface-card/40 shrink-0">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="h-11 w-11 rounded-2xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center shrink-0">
                                    <ClipboardList className="h-5 w-5 text-brand-primary" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="font-black text-base text-text-primary truncate">
                                        {selectedTask.name || `Task #${selectedTask.id}`}
                                    </h3>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                                            Task #{selectedTask.id}
                                        </span>
                                        {selectedTask.status === "5" && (
                                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                                                <CheckCircle2 className="h-3 w-3" /> Completed
                                            </span>
                                        )}
                                        {selectedTask.project_data?.name && (
                                            <span className="text-xs text-text-muted flex items-center gap-1">
                                                <Folder className="h-3 w-3" /> {selectedTask.project_data.name}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setSelectedTaskId(null)} className="shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-xl border border-border-card bg-surface-card text-text-muted hover:text-text-primary hover:bg-surface-card/60 transition-colors">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 md:p-8 overflow-y-auto space-y-6">

                            {/* Horizontal Meta Row */}
                            <div className="flex flex-wrap gap-3">

                                {/* Status pill */}
                                <div className="flex items-center gap-2 ui-card-soft rounded-xl px-4 py-2 text-xs">
                                    <BarChart className="h-4 w-4 text-text-muted shrink-0" />
                                    <span className="text-text-secondary font-semibold">{statusLabel(selectedTask.status)}</span>
                                    <span className="mx-1 text-text-muted">·</span>
                                    <Flag className={`h-3.5 w-3.5 shrink-0 ${selectedTask.priority === '4' ? 'text-rose-500' : selectedTask.priority === '3' ? 'text-amber-500' : 'text-brand-primary'}`} />
                                    <span className="font-bold text-text-primary">{priorityLabel(selectedTask.priority)}</span>
                                </div>

                                {/* Shift times pill */}
                                {(selectedTask.firstShiftStart || selectedTask.lastShiftEnd) && (
                                    <div className="flex items-center gap-2 ui-card-soft rounded-xl px-4 py-2 text-xs">
                                        <CalendarDays className="h-4 w-4 text-text-muted shrink-0" />
                                        <span className="text-text-secondary">
                                            {selectedTask.firstShiftStart
                                                ? new Date(selectedTask.firstShiftStart).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                                                : '—'}
                                        </span>
                                        <span className="text-text-muted">→</span>
                                        <span className="text-text-secondary">
                                            {selectedTask.lastShiftEnd
                                                ? new Date(selectedTask.lastShiftEnd).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                                                : <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" /> Active</span>}
                                        </span>
                                    </div>
                                )}

                                {/* Caregivers pill */}
                                {selectedTask.assignedStaff?.length > 0 && (
                                    <div className="flex items-center gap-2 ui-card-soft rounded-xl px-4 py-2 text-xs">
                                        <Users className="h-4 w-4 text-text-muted shrink-0" />
                                        <span className="font-semibold text-text-primary">{selectedTask.assignedStaff.join(', ')}</span>
                                    </div>
                                )}

                                {/* Client pill */}
                                {selectedTask.client_name && (
                                    <div className="flex items-center gap-2 bg-brand-primary/10 border border-brand-primary/20 rounded-xl px-4 py-2 text-xs">
                                        <div className="h-5 w-5 rounded-full bg-brand-primary/20 flex items-center justify-center text-[9px] font-bold text-brand-primary shrink-0">
                                            {selectedTask.client_name.charAt(0)}
                                        </div>
                                        <span className="font-bold text-brand-primary">{selectedTask.client_name}</span>
                                        {selectedTask.project_data?.name && (
                                            <><span className="text-brand-primary/60">·</span><span className="text-brand-primary/80 text-[10px]">{selectedTask.project_data.name}</span></>
                                        )}
                                    </div>
                                )}

                                {/* Deadline pill */}
                                {selectedTask.duedate && selectedTask.duedate !== '0000-00-00' && (
                                    <div className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs border ${new Date(selectedTask.duedate) < new Date() && selectedTask.status !== '5'
                                        ? 'bg-rose-500/10 border-rose-500/20 text-rose-500'
                                        : 'ui-card-soft text-text-secondary'
                                        }`}>
                                        <Clock className="h-4 w-4 shrink-0" />
                                        <span className="font-semibold">Due {selectedTask.duedate}</span>
                                    </div>
                                )}
                            </div>

                            {/* Collapsible Instructions */}
                            <div className="border border-border-card rounded-2xl overflow-hidden">
                                <button
                                    onClick={() => setShowInstructions(v => !v)}
                                    className="w-full flex items-center justify-between px-5 py-3 bg-surface-card/40 hover:bg-surface-card/70 transition-colors text-left"
                                >
                                    <span className="flex items-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-wider">
                                        <FileText className="h-3.5 w-3.5" /> Instructions / Description
                                    </span>
                                    <ChevronRight className={`h-4 w-4 text-text-muted transition-transform ${showInstructions ? 'rotate-90' : ''}`} />
                                </button>
                                {showInstructions && (
                                    <div className="px-5 py-4 border-t border-border-card text-text-secondary text-sm whitespace-pre-wrap leading-relaxed">
                                        {stripHtml(selectedTask.description) || <span className="italic text-text-muted">No instructions provided.</span>}
                                    </div>
                                )}
                            </div>

                            {/* Custom Fields */}
                            {selectedTask.customfields?.length > 0 && (
                                <div>
                                    <h4 className="flex items-center gap-2 text-[10px] font-black text-text-muted uppercase tracking-wider mb-3">
                                        <ListTodo className="h-3.5 w-3.5 text-brand-primary" /> Custom Fields
                                    </h4>
                                    <div className="crm-panel p-5 rounded-2xl space-y-3 text-xs">
                                        {selectedTask.customfields.map((cf: any, i: number) => (
                                            <div key={i} className="flex justify-between items-start border-b last:border-0 border-border-card pb-2 last:pb-0">
                                                <span className="text-text-muted">{cf.label}</span>
                                                <span className="font-bold text-text-primary text-right max-w-[60%] break-words">
                                                    {cf.value || <span className="text-text-muted font-normal italic">Empty</span>}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Checklist */}
                            {selectedTask.checklist_items?.length > 0 && (
                                <div>
                                    <h4 className="flex items-center gap-2 text-[10px] font-black text-text-muted uppercase tracking-wider mb-3">
                                        <ListChecks className="h-3.5 w-3.5 text-brand-primary" /> Task Checklist
                                    </h4>
                                    <div className="crm-panel p-5 rounded-2xl space-y-2.5 text-xs">
                                        {selectedTask.checklist_items.map((item: any) => (
                                            <div key={item.id} className="flex items-center gap-3 text-xs">
                                                <div className={`h-4 w-4 rounded-full flex items-center justify-center border shrink-0 ${item.finished === '1' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-border-card'}`}>
                                                    {item.finished === '1' && <CheckCircle2 className="h-3 w-3" />}
                                                </div>
                                                <span className={`font-semibold ${item.finished === '1' ? 'text-text-muted line-through' : 'text-text-secondary'}`}>{item.description}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Service Reports */}
                            <div className="pt-8 border-t border-border-card">
                                <h4 className="flex items-center gap-2 text-base font-black text-text-primary mb-5">
                                    <FileSignature className="h-5 w-5 text-brand-primary" /> Service Reports
                                </h4>

                                {pdfError && (
                                    <div className="mb-4 text-xs text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-2.5">{pdfError}</div>
                                )}

                                {reportsFetching ? (
                                    <div className="flex items-center gap-2 text-text-muted text-xs">
                                        <Loader2 className="h-4 w-4 animate-spin text-brand-primary" /> Fetching reports…
                                    </div>
                                ) : serviceReports.length === 0 ? (
                                    <div className="text-xs text-text-muted crm-panel rounded-2xl p-4">
                                        No service reports filed for this task yet.
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {serviceReports.map((sr: any) => (
                                            <div
                                                key={sr._id}
                                                className="crm-panel rounded-2xl overflow-hidden shadow-sm"
                                            >
                                                {/* Report Header */}
                                                <div className="bg-surface-card/40 px-6 py-4 border-b border-border-card flex justify-between items-center gap-3">
                                                    <div className="min-w-0">
                                                        <h5 className="font-bold text-sm text-text-primary flex items-center gap-2">
                                                            <User className="h-4 w-4 text-brand-primary shrink-0" /> {sr.staff_name || `Staff #${sr.staff_id}`}
                                                        </h5>
                                                        <p className="text-[10px] text-text-muted mt-0.5">
                                                            Submitted {new Date(sr.time_taken).toLocaleString()}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <span className="px-2.5 py-1 ui-card-soft rounded-full text-[10px] font-mono font-bold text-text-muted">
                                                            SR #{sr._id.slice(-6)}
                                                        </span>
                                                        <button
                                                            onClick={() => handleDownloadPDF(sr._id)}
                                                            disabled={isGeneratingPdf[sr._id]}
                                                            className="flex items-center gap-2 px-3 py-1.5 bg-brand-primary/10 hover:bg-brand-primary/20 border border-brand-primary/20 text-brand-primary rounded-lg text-[10px] font-bold transition-all disabled:opacity-50 active:scale-95"
                                                        >
                                                            {isGeneratingPdf[sr._id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                                                            {isGeneratingPdf[sr._id] ? "Processing…" : "PDF"}
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="p-6 space-y-6">
                                                    {/* Clinical Q&A */}
                                                    {sr.questionnaire?.length > 0 && (
                                                        <div>
                                                            <h6 className="text-[10px] font-black uppercase tracking-wider text-text-muted mb-3 border-b border-border-card pb-2">Clinical Q&A</h6>
                                                            <div className="space-y-2.5">
                                                                 {sr.questionnaire.map((q: any, idx: number) => (
                                                                     <div key={idx} className="ui-card-soft p-3.5 rounded-xl flex items-start justify-between gap-4">
                                                                         <p className="text-xs font-bold text-text-primary leading-relaxed">{q.question}</p>
                                                                         <span className="text-xs font-semibold text-text-secondary bg-surface-card border border-border-card rounded-lg px-2.5 py-1 shrink-0 whitespace-nowrap">{q.answer}</span>
                                                                     </div>
                                                                 ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                        {/* Checklist at submission */}
                                                        {sr.checklist_items?.length > 0 && (
                                                            <div>
                                                                <h6 className="text-[10px] font-black uppercase tracking-wider text-text-muted mb-3 border-b border-border-card pb-2">Checklist at Submission</h6>
                                                                <div className="space-y-2">
                                                                    {sr.checklist_items.map((item: any, idx: number) => {
                                                                        const isDone = item.finished === "1" || item.finished === 1 || item.finished === true || item.finished === "true";
                                                                        return (
                                                                            <div key={idx} className="flex items-start gap-2 text-xs">
                                                                                {isDone
                                                                                    ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                                                                                    : <div className="h-4 w-4 rounded-full border border-border-card shrink-0 mt-0.5" />}
                                                                                <span className={isDone ? "line-through text-text-muted" : "text-text-secondary"}>{item.description}</span>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Notes */}
                                                        <div>
                                                            <h6 className="text-[10px] font-black uppercase tracking-wider text-text-muted mb-3 border-b border-border-card pb-2">Caregiver Notes</h6>
                                                            <div className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
                                                                {sr.note || <span className="text-text-muted italic">No notes provided.</span>}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Signatures */}
                                                    {(sr.customer_signature?.url || sr.staff_signature?.url) && (
                                                        <div className="pt-4 border-t border-border-card">
                                                            <h6 className="text-[10px] font-black uppercase tracking-wider text-text-muted mb-4">Signatures</h6>
                                                            <div className="flex flex-wrap gap-8">
                                                                {sr.staff_signature?.url && (
                                                                    <div>
                                                                        <p className="text-[10px] font-bold text-text-muted mb-2 flex items-center gap-1">
                                                                            <User className="h-3 w-3" /> Staff Signature
                                                                        </p>
                                                                        <div className="border border-border-card rounded-xl p-2 bg-white inline-block">
                                                                            <img src={sr.staff_signature.url} alt="Staff Signature" className="h-20 max-w-[200px] object-contain" crossOrigin="anonymous" />
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {sr.customer_signature?.url && (
                                                                    <div>
                                                                        <p className="text-[10px] font-bold text-text-muted mb-2 flex items-center gap-1">
                                                                            <Users className="h-3 w-3" /> Client Signature
                                                                        </p>
                                                                        <div className="border border-border-card rounded-xl p-2 bg-white inline-block">
                                                                            <img src={sr.customer_signature.url} alt="Client Signature" className="h-20 max-w-[200px] object-contain" crossOrigin="anonymous" />
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
