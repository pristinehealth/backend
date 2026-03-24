"use client";

import { useState, useRef, useEffect } from "react";
import { useGetTasksQuery, useGetServiceReportsByTaskIdQuery } from "@/lib/features/api/perfexApi";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import {
    Loader2, AlertCircle, ClipboardList, CheckCircle2, X, CalendarDays, BarChart,
    FileText, Flag, Link as LinkIcon, DollarSign, Folder, ListTodo, ListChecks,
    Clock, ChevronLeft, ChevronRight, FileSignature, Download, Search, User, Users
} from "lucide-react";

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
        // Monday-anchored week (0=Sun → shift to Mon)
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
    const reportRefs = useRef<Record<string, HTMLDivElement | null>>({});

    const handleDownloadPDF = async (reportId: string) => {
        const element = reportRefs.current[reportId];
        if (!element) return;
        try {
            setIsGeneratingPdf(prev => ({ ...prev, [reportId]: true }));
            const canvas = await html2canvas(element, { scale: 2, useCORS: true, logging: false });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`Service_Report_${reportId.slice(-6)}.pdf`);
        } catch {
            alert("An error occurred while generating the PDF.");
        } finally {
            setIsGeneratingPdf(prev => ({ ...prev, [reportId]: false }));
        }
    };

    const taskList: any[] = Array.isArray(rawData) ? rawData : (rawData?.data ?? []);
    const pagination = rawData?.pagination ?? null;

    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [showInstructions, setShowInstructions] = useState(false);
    const selectedTask = selectedTaskId ? taskList.find(t => t.id === selectedTaskId) : null;

    const { data: reportsData, isFetching: reportsFetching } = useGetServiceReportsByTaskIdQuery(
        selectedTaskId as string, { skip: !selectedTaskId }
    );
    const serviceReports = reportsData?.data || [];

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
                <Loader2 className="h-10 w-10 text-brand-blue-light animate-spin" />
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

    return (
        <div className="space-y-4">

            {/* Filters Row */}
            <div className="flex flex-wrap gap-3 items-center">
                {/* Staff search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    <input
                        type="text"
                        value={staffInput}
                        onChange={e => setStaffInput(e.target.value)}
                        placeholder="Search by caregiver…"
                        className="pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-blue w-52"
                    />
                </div>

                {/* Date quick-chips */}
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Date:</span>
                    {([
                        { label: "Today", chip: 'today' as const },
                        { label: "This Week", chip: 'week' as const },
                    ]).map(({ label, chip }) => (
                        <button
                            key={chip}
                            onClick={() => handleChip(chip)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${activeChip === chip
                                ? "bg-brand-orange text-white border-brand-orange"
                                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-brand-orange hover:text-brand-orange"
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
                        className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-orange"
                    />
                    {(activeChip || customDate) && (
                        <button
                            onClick={() => { setActiveChip(''); setCustomDate(''); setPage(1); }}
                            className="flex items-center gap-1 px-2 py-1.5 rounded-xl text-xs font-bold text-slate-400 hover:text-red-500 border border-slate-200 dark:border-slate-700 hover:border-red-300 transition-all"
                            title="Clear date filter"
                        >
                            <X className="h-3 w-3" /> Clear
                        </button>
                    )}
                </div>
            </div>

            {/* Main Table */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 uppercase tracking-wider">
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
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 relative">
                            {isFetching && (
                                <tr className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-[2px] z-10 flex items-center justify-center">
                                    <td><Loader2 className="h-8 w-8 text-brand-blue-light animate-spin my-8" /></td>
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
                                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors group"
                                    >
                                        <td className="p-4 text-sm font-medium text-slate-400">#{task.id}</td>
                                        <td className="p-4">
                                            <div className="font-bold text-slate-900 dark:text-white group-hover:text-brand-blue dark:group-hover:text-brand-blue-light transition-colors line-clamp-1">
                                                {task.name}
                                            </div>
                                            {task.project_data?.name && (
                                                <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                                                    <Folder className="h-3 w-3" /> {task.project_data.name}
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            {task.assignedStaff?.length > 0 ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {task.assignedStaff.map((name: string) => (
                                                        <span key={name} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-blue-muted dark:bg-brand-blue-light/10 text-brand-blue-dark dark:text-indigo-300">
                                                            <User className="h-2.5 w-2.5" />{name}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-slate-400 italic">Unassigned</span>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            <span className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
                                                <Flag className={`h-3.5 w-3.5 ${task.priority === "4" ? "text-red-500" : task.priority === "3" ? "text-orange-500" : "text-sky-500"}`} />
                                                {priorityLabel(task.priority)}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <span className={`text-sm ${new Date(task.duedate) < new Date() && task.status !== "5" ? "text-red-500 font-bold" : "text-slate-700 dark:text-slate-300"}`}>
                                                {task.duedate || 'N/A'}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            {task.status === "5" ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                                                    <CheckCircle2 className="h-3.5 w-3.5" /> Completed
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
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
                    <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
                        <div className="text-sm font-medium text-slate-500">
                            {staffSearch
                                ? <><span className="font-semibold text-slate-700 dark:text-slate-200">{pagination.total}</span> task{pagination.total !== 1 ? 's' : ''} for <span className="font-semibold text-brand-blue dark:text-brand-blue-light">&quot;{staffSearch}&quot;</span>{pagination.totalPages > 1 && <> · Page <span className="text-slate-900 dark:text-white">{pagination.page}</span> of <span className="text-slate-900 dark:text-white">{pagination.totalPages}</span></>}</>
                                : <>Page <span className="text-slate-900 dark:text-white">{pagination.page}</span> of <span className="text-slate-900 dark:text-white">{pagination.totalPages}</span> <span className="ml-2 text-slate-400">({pagination.total} tasks)</span></>
                            }
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || isFetching} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center">
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <button onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={page === pagination.totalPages || isFetching} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center">
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Task Details Modal */}
            {selectedTaskId && selectedTask && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setSelectedTaskId(null); }}>
                    <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">

                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 shrink-0">
                            <div>
                                <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                                    <ClipboardList className="h-5 w-5 text-brand-blue-light" />
                                    {selectedTask.name}
                                </h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-brand-blue-muted dark:bg-brand-blue-light/10 text-brand-blue dark:text-brand-blue-light">
                                        Task #{selectedTask.id}
                                    </span>
                                    {selectedTask.status === "5" && (
                                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                            <CheckCircle2 className="h-3 w-3" /> Completed
                                        </span>
                                    )}
                                    {selectedTask.project_data?.name && (
                                        <span className="text-xs text-slate-500 flex items-center gap-1">
                                            <Folder className="h-3 w-3" /> {selectedTask.project_data.name}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <button onClick={() => setSelectedTaskId(null)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors h-9 w-9 flex items-center justify-center">
                                <X className="h-5 w-5 text-slate-500" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 md:p-8 overflow-y-auto space-y-6">

                            {/* Horizontal Meta Row */}
                            <div className="flex flex-wrap gap-3">

                                {/* Status pill */}
                                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm">
                                    <BarChart className="h-4 w-4 text-slate-400 shrink-0" />
                                    <span className="text-slate-500 font-medium">{statusLabel(selectedTask.status)}</span>
                                    <span className="mx-1 text-slate-300">·</span>
                                    <Flag className={`h-3.5 w-3.5 shrink-0 ${selectedTask.priority === '4' ? 'text-red-500' : selectedTask.priority === '3' ? 'text-orange-500' : 'text-sky-500'}`} />
                                    <span className="font-semibold text-slate-700 dark:text-slate-200">{priorityLabel(selectedTask.priority)}</span>
                                </div>

                                {/* Shift times pill */}
                                {(selectedTask.firstShiftStart || selectedTask.lastShiftEnd) && (
                                    <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm">
                                        <CalendarDays className="h-4 w-4 text-slate-400 shrink-0" />
                                        <span className="text-slate-500">
                                            {selectedTask.firstShiftStart
                                                ? new Date(selectedTask.firstShiftStart).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                                                : '—'}
                                        </span>
                                        <span className="text-slate-300">→</span>
                                        <span className="text-slate-500">
                                            {selectedTask.lastShiftEnd
                                                ? new Date(selectedTask.lastShiftEnd).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                                                : <span className="text-emerald-600 flex items-center gap-1"><div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" /> Active</span>}
                                        </span>
                                    </div>
                                )}

                                {/* Caregivers pill */}
                                {selectedTask.assignedStaff?.length > 0 && (
                                    <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm">
                                        <Users className="h-4 w-4 text-slate-400 shrink-0" />
                                        <span className="font-medium text-slate-700 dark:text-slate-200">{selectedTask.assignedStaff.join(', ')}</span>
                                    </div>
                                )}

                                {/* Client pill */}
                                {selectedTask.client_name && (
                                    <div className="flex items-center gap-2 bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/30 rounded-xl px-4 py-2.5 text-sm">
                                        <div className="h-5 w-5 rounded-full bg-purple-200 dark:bg-purple-500/30 flex items-center justify-center text-[10px] font-bold text-purple-700 dark:text-purple-300 shrink-0">
                                            {selectedTask.client_name.charAt(0)}
                                        </div>
                                        <span className="font-semibold text-purple-700 dark:text-purple-300">{selectedTask.client_name}</span>
                                        {selectedTask.project_data?.name && (
                                            <><span className="text-purple-300">·</span><span className="text-purple-500 dark:text-purple-400 text-xs">{selectedTask.project_data.name}</span></>
                                        )}
                                    </div>
                                )}

                                {/* Deadline pill — only if real date */}
                                {selectedTask.duedate && selectedTask.duedate !== '0000-00-00' && (
                                    <div className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm border ${new Date(selectedTask.duedate) < new Date() && selectedTask.status !== '5'
                                        ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400'
                                        : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-500'
                                        }`}>
                                        <Clock className="h-4 w-4 shrink-0" />
                                        <span className="font-medium">Due {selectedTask.duedate}</span>
                                    </div>
                                )}

                                {/* Hourly rate pill */}
                                {Number(selectedTask.hourly_rate) > 0 && (
                                    <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl px-4 py-2.5 text-sm">
                                        <DollarSign className="h-4 w-4 text-emerald-600 shrink-0" />
                                        <span className="font-semibold text-emerald-700 dark:text-emerald-300">${Number(selectedTask.hourly_rate).toFixed(2)}/hr</span>
                                    </div>
                                )}

                                {/* Billable pill */}
                                {selectedTask.billable !== undefined && selectedTask.billable !== null && (
                                    <div className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm border ${selectedTask.billable === '1' || selectedTask.billable === 1
                                        ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30'
                                        : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'}`}>
                                        <DollarSign className={`h-4 w-4 shrink-0 ${selectedTask.billable === '1' || selectedTask.billable === 1 ? 'text-emerald-600' : 'text-slate-400'}`} />
                                        <span className={`font-semibold ${selectedTask.billable === '1' || selectedTask.billable === 1 ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500'}`}>
                                            {selectedTask.billable === '1' || selectedTask.billable === 1 ? 'Billable' : 'Non-Billable'}
                                        </span>
                                    </div>
                                )}

                                {/* Milestone pill */}
                                {(selectedTask.milestone_name || selectedTask.milestone) && (
                                    <div className="flex items-center gap-2 bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/30 rounded-xl px-4 py-2.5 text-sm">
                                        <ListTodo className="h-4 w-4 text-violet-500 shrink-0" />
                                        <span className="font-semibold text-violet-700 dark:text-violet-300">
                                            {selectedTask.milestone_name || `Milestone #${selectedTask.milestone}`}
                                        </span>
                                    </div>
                                )}

                                {/* Start date pill */}
                                {selectedTask.startdate && selectedTask.startdate !== '0000-00-00' && (
                                    <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm">
                                        <CalendarDays className="h-4 w-4 text-slate-400 shrink-0" />
                                        <span className="text-slate-500 font-medium">Start: <span className="text-slate-700 dark:text-slate-200">{selectedTask.startdate.split(' ')[0]}</span></span>
                                    </div>
                                )}
                            </div>

                            {/* Collapsible Instructions */}
                            <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                                <button
                                    onClick={() => setShowInstructions(v => !v)}
                                    className="w-full flex items-center justify-between px-5 py-3.5 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
                                >
                                    <span className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                                        <FileText className="h-3.5 w-3.5" /> Instructions / Description
                                    </span>
                                    <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${showInstructions ? 'rotate-90' : ''}`} />
                                </button>
                                {showInstructions && (
                                    <div className="px-5 py-4 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">
                                        {stripHtml(selectedTask.description) || <span className="italic text-slate-400">No instructions provided.</span>}
                                    </div>
                                )}
                            </div>

                            {/* Custom Fields */}
                            {selectedTask.customfields?.length > 0 && (
                                <div>
                                    <h4 className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
                                        <ListTodo className="h-3.5 w-3.5" /> Custom Fields
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
                                    <h4 className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
                                        <ListChecks className="h-3.5 w-3.5" /> Task Checklist
                                    </h4>
                                    <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-2">
                                        {selectedTask.checklist_items.map((item: any) => (
                                            <div key={item.id} className="flex items-center gap-3 text-sm">
                                                <div className={`h-4 w-4 rounded-full flex items-center justify-center border shrink-0 ${item.finished === '1' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                                                    {item.finished === '1' && <CheckCircle2 className="h-3 w-3" />}
                                                </div>
                                                <span className={`font-medium ${item.finished === '1' ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200'}`}>{item.description}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Service Reports */}
                            <div className="pt-8 border-t border-slate-200 dark:border-slate-700">
                                <h4 className="flex items-center gap-2 text-lg font-extrabold text-slate-900 dark:text-white mb-5">
                                    <FileSignature className="h-5 w-5 text-emerald-500" /> Service Reports
                                </h4>

                                {reportsFetching ? (
                                    <div className="flex items-center gap-2 text-slate-500">
                                        <Loader2 className="h-4 w-4 animate-spin" /> Fetching reports…
                                    </div>
                                ) : serviceReports.length === 0 ? (
                                    <div className="text-sm text-slate-500 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-slate-800">
                                        No service reports filed for this task yet.
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {serviceReports.map((sr: any) => (
                                            <div
                                                key={sr._id}
                                                ref={(el) => { if (el) reportRefs.current[sr._id] = el; }}
                                                className="bg-white dark:bg-slate-800 rounded-2xl border-2 border-emerald-100 dark:border-emerald-900/30 overflow-hidden shadow-sm"
                                            >
                                                {/* Report Header */}
                                                <div className="bg-emerald-50/50 dark:bg-emerald-500/5 px-6 py-4 border-b border-emerald-100 dark:border-emerald-900/30 flex justify-between items-center">
                                                    <div>
                                                        <h5 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                                            <User className="h-4 w-4 text-emerald-500" /> {sr.staff_name || `Staff #${sr.staff_id}`}
                                                        </h5>
                                                        <p className="text-xs text-slate-500 mt-0.5">
                                                            Submitted {new Date(sr.time_taken).toLocaleString()}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span className="px-3 py-1 bg-white dark:bg-slate-900 rounded-full border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300">
                                                            SR #{sr._id.slice(-6)}
                                                        </span>
                                                        <button
                                                            onClick={() => handleDownloadPDF(sr._id)}
                                                            disabled={isGeneratingPdf[sr._id]}
                                                            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-500/20 dark:hover:bg-emerald-500/30 text-emerald-700 dark:text-emerald-400 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                                                        >
                                                            {isGeneratingPdf[sr._id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                                            {isGeneratingPdf[sr._id] ? "Processing…" : "PDF"}
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="p-6 space-y-6">
                                                    {/* Clinical Q&A */}
                                                    {sr.questionnaire?.length > 0 && (
                                                        <div>
                                                            <h6 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 border-b border-slate-100 dark:border-slate-700 pb-2">Clinical Q&A</h6>
                                                            <div className="space-y-3">
                                                                {sr.questionnaire.map((q: any, idx: number) => (
                                                                    <div key={idx} className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-700">
                                                                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">{q.question}</p>
                                                                        <p className="text-sm text-slate-600 dark:text-slate-400">{q.answer}</p>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                        {/* Checklist at submission */}
                                                        {sr.checklist_items?.length > 0 && (
                                                            <div>
                                                                <h6 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 border-b border-slate-100 dark:border-slate-700 pb-2">Checklist at Submission</h6>
                                                                <div className="space-y-2">
                                                                    {sr.checklist_items.map((item: any, idx: number) => {
                                                                        const isDone = item.finished === "1" || item.finished === 1 || item.finished === true || item.finished === "true";
                                                                        return (
                                                                            <div key={idx} className="flex items-start gap-2 text-sm">
                                                                                {isDone
                                                                                    ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                                                                                    : <div className="h-4 w-4 rounded-full border border-slate-300 shrink-0 mt-0.5" />}
                                                                                <span className={isDone ? "line-through text-slate-400" : "text-slate-700 dark:text-slate-300"}>{item.description}</span>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Notes */}
                                                        <div>
                                                            <h6 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 border-b border-slate-100 dark:border-slate-700 pb-2">Caregiver Notes</h6>
                                                            <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                                                                {sr.note || <span className="text-slate-400 italic">No notes provided.</span>}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Signatures */}
                                                    {(sr.customer_signature?.url || sr.staff_signature?.url) && (
                                                        <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                                                            <h6 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">Signatures</h6>
                                                            <div className="flex flex-wrap gap-8">
                                                                {sr.staff_signature?.url && (
                                                                    <div>
                                                                        <p className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1">
                                                                            <User className="h-3 w-3" /> Staff Signature
                                                                        </p>
                                                                        <div className="border-2 border-slate-200 dark:border-slate-700 rounded-xl p-2 bg-white inline-block">
                                                                            <img src={sr.staff_signature.url} alt="Staff Signature" className="h-20 max-w-[200px] object-contain" crossOrigin="anonymous" />
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {sr.customer_signature?.url && (
                                                                    <div>
                                                                        <p className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1">
                                                                            <Users className="h-3 w-3" /> Client Signature
                                                                        </p>
                                                                        <div className="border-2 border-slate-200 dark:border-slate-700 rounded-xl p-2 bg-white inline-block">
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

                        {/* Footer */}
                        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end shrink-0">
                            <button
                                onClick={() => setSelectedTaskId(null)}
                                className="px-6 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-white rounded-xl font-bold transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
