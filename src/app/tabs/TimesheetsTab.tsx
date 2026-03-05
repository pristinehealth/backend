import { useState } from "react";
import { useGetTimesheetsQuery, useGetTasksQuery, useGetStaffQuery, useGetProjectsQuery } from "@/lib/features/api/perfexApi";
import { Loader2, AlertCircle, Clock, CheckCircle2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

export function TimesheetsTab() {
    const [page, setPage] = useState(1);
    const limit = 50;

    const { data: rawTimesheets, isLoading: loadingSheets, error: errSheets, isFetching: isFetchingSheets } = useGetTimesheetsQuery({ page, limit });
    const { data: rawTasks, isLoading: loadingTasks, error: errTasks } = useGetTasksQuery(); // Fetching all for mapping relation
    const { data: rawStaff, isLoading: loadingStaff } = useGetStaffQuery();
    const { data: rawProjects, isLoading: loadingProjects } = useGetProjectsQuery();

    const sheetsData = rawTimesheets?.data || [];
    const sheetsPagination = rawTimesheets?.pagination || { totalPages: 1, total: 0 };

    const tasks: any[] = Array.isArray(rawTasks) ? rawTasks : (rawTasks && Array.isArray((rawTasks as any).data) ? (rawTasks as any).data : []);
    const staffList: any[] = Array.isArray(rawStaff) ? rawStaff : (rawStaff && Array.isArray((rawStaff as any).data) ? (rawStaff as any).data : []);
    const projectsList: any[] = Array.isArray(rawProjects) ? rawProjects : (rawProjects && Array.isArray((rawProjects as any).data) ? (rawProjects as any).data : []);

    if (loadingTasks || loadingStaff || loadingProjects || (loadingSheets && page === 1)) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="h-10 w-10 text-indigo-500 animate-spin" />
                <p className="text-slate-500 mt-4 animate-pulse">Loading timesheets...</p>
            </div>
        );
    }

    if (errSheets || errTasks) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center text-red-600">
                <AlertCircle className="h-12 w-12 mx-auto mb-4" />
                <h3 className="font-bold text-lg">Failed to load Timesheets or Tasks</h3>
            </div>
        );
    }

    if (!sheetsData.length && !isFetchingSheets) {
        return <div className="text-center py-20 text-slate-500">No timesheets found.</div>;
    }

    // Create a dictionary for quick task lookup
    const taskDict: Record<string, any> = {};
    tasks.forEach(task => {
        taskDict[task.id] = task;
    });

    // Create a dictionary for quick staff lookup
    const staffDict: Record<string, any> = {};
    staffList.forEach(s => {
        staffDict[s.staffid || s.id] = s;
    });

    // Create a dictionary for quick project lookup (by Perfex project ID)
    const projectDict: Record<string, any> = {};
    projectsList.forEach(proj => {
        projectDict[proj.id] = proj;
    });

    const formatTimestamp = (ts: string) => {
        if (!ts) return 'Unknown';
        // If it looks like a unix timestamp
        if (!isNaN(Number(ts)) && ts.length >= 10) {
            return new Date(Number(ts) * 1000).toLocaleString(undefined, {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
        }
        return ts;
    };

    const calculateDuration = (start: string, end: string) => {
        if (!start || !end) return '-';
        if (!isNaN(Number(start)) && !isNaN(Number(end))) {
            const diffMs = (Number(end) - Number(start)) * 1000;
            if (diffMs < 0) return '-';
            const hours = Math.floor(diffMs / 3600000);
            const mins = Math.floor((diffMs % 3600000) / 60000);
            return `${hours}h ${mins}m`;
        }
        return '-';
    };

    const getTaskAddress = (taskObj: any) => {
        if (!taskObj) return null;
        // 1. Try resolving through actual project entity relation first
        let projectObj = taskObj?.project_data;

        if (taskObj?.rel_type === 'project' && taskObj?.rel_id) {
            projectObj = projectDict[taskObj.rel_id] || taskObj.project_data;
        }

        if (!projectObj) return null;

        // Extract from project custom fields
        const customFields = projectObj.customfields || [];
        const svcAddress = customFields.find((f: any) => f.label === 'Service Address' || f.name === 'Service Address')?.value;
        const svcCity = customFields.find((f: any) => f.label === 'City' || f.name === 'City')?.value;
        const svcState = customFields.find((f: any) => f.label === 'State' || f.name === 'State')?.value;
        const svcZip = customFields.find((f: any) => f.label === 'Zip Code' || f.name === 'Zip Code')?.value;

        if (svcAddress) {
            return `${svcAddress}, ${svcCity || ''} ${svcState || ''} ${svcZip || ''}`.trim().replace(/,\s*$/, '');
        }

        // Extract from related client_data embedded directly
        const clientData = projectObj?.client_data;
        if (clientData?.address) {
            return `${clientData.address}, ${clientData.city || ''} ${clientData.state || ''} ${clientData.zip || ''}`.trim().replace(/,\s*$/, '');
        }

        return null;
    };

    const handleNextPage = () => {
        if (page < sheetsPagination.totalPages) setPage(page + 1);
    };

    const handlePrevPage = () => {
        if (page > 1) setPage(page - 1);
    };

    return (
        <div className="space-y-4 max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-6 gap-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Timesheets Ledger</h2>
                    <p className="text-sm text-slate-500">Chronological list of all logged shifts across the company.</p>
                </div>

                {/* Pagination Controls Top */}
                <div className="flex items-center gap-4 bg-white dark:bg-slate-800 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                    <button
                        onClick={handlePrevPage}
                        disabled={page === 1 || isFetchingSheets}
                        className="text-slate-500 hover:text-indigo-600 disabled:opacity-50 disabled:hover:text-slate-500 transition-colors"
                    >
                        Previous
                    </button>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Page {page} of {sheetsPagination.totalPages || 1}
                    </span>
                    <button
                        onClick={handleNextPage}
                        disabled={page >= sheetsPagination.totalPages || isFetchingSheets}
                        className="text-slate-500 hover:text-indigo-600 disabled:opacity-50 disabled:hover:text-slate-500 transition-colors"
                    >
                        Next
                    </button>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden relative">
                {isFetchingSheets && (
                    <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm z-10 flex items-center justify-center pointer-events-none">
                        <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-100/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                            <tr>
                                <th className="px-6 py-4 font-medium">Task / Project</th>
                                <th className="px-6 py-4 font-medium">Staff</th>
                                <th className="px-6 py-4 font-medium">Notes</th>
                                <th className="px-6 py-4 font-medium whitespace-nowrap">Start Time</th>
                                <th className="px-6 py-4 font-medium">Duration</th>
                                <th className="px-6 py-4 font-medium text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sheetsData.map((sheet: any) => {
                                const taskData = taskDict[sheet.task_id];
                                const staffInfo = staffDict[sheet.staff_id] || {};
                                const staffName = staffInfo.full_name || `${staffInfo.firstname || ''} ${staffInfo.lastname || ''}`.trim() || `Staff #${sheet.staff_id}`;
                                const address = getTaskAddress(taskData);

                                return (
                                    <tr key={sheet.id} className="border-b last:border-0 border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1">
                                                <span className="font-semibold text-slate-900 dark:text-white line-clamp-1">
                                                    {taskData?.name || `Task #${sheet.task_id}`}
                                                </span>
                                                {address && (
                                                    <span className="text-xs text-slate-500 flex items-center gap-1 truncate max-w-[200px]" title={address}>
                                                        <MapPin className="h-3 w-3 shrink-0" />
                                                        {address}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-3">
                                                <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">
                                                    {sheet.staff_id}
                                                </div>
                                                <span className="font-medium text-slate-700 dark:text-slate-200 truncate max-w-[120px]" title={staffName}>
                                                    {staffName}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-slate-600 dark:text-slate-400 italic line-clamp-2 max-w-xs" title={sheet.note || ''}>
                                                {sheet.note || '—'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-slate-500 font-medium tracking-tight">
                                            {formatTimestamp(sheet.start_time)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-slate-700 dark:text-slate-300 font-semibold">
                                            {calculateDuration(sheet.start_time, sheet.end_time)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right">
                                            {sheet.end_time ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                                    Ended
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-600 border border-amber-200/50 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
                                                    <Clock className="h-3.5 w-3.5" />
                                                    Ongoing
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination Controls Bottom */}
            {sheetsPagination.totalPages > 1 && (
                <div className="flex justify-center mt-6">
                    <div className="flex items-center gap-4 bg-white dark:bg-slate-800 px-6 py-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                        <button
                            onClick={handlePrevPage}
                            disabled={page === 1 || isFetchingSheets}
                            className="px-4 py-2 text-sm font-semibold rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent transition-all"
                        >
                            Back
                        </button>
                        <span className="text-sm font-medium text-slate-500 whitespace-nowrap">
                            Page <strong className="text-slate-900 dark:text-white mx-1">{page}</strong> of <strong className="text-slate-900 dark:text-white mx-1">{sheetsPagination.totalPages}</strong>
                        </span>
                        <button
                            onClick={handleNextPage}
                            disabled={page >= sheetsPagination.totalPages || isFetchingSheets}
                            className="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-40 disabled:hover:bg-indigo-50 transition-all"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
