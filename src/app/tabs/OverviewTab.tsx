"use client";

import {
  Activity,
  AlertTriangle,
  Briefcase,
  Building2,
  CheckCircle2,
  ClipboardList,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useGetOverviewQuery } from "@/lib/features/api/complianceApi";

interface OverviewData {
  staff: { total: number; verified: number };
  customers: { total: number; active: number };
  tasks: { total: number; closed: number; overdue: number };
  projects: { total: number; finished: number };
  timesheets: { total: number };
  upcoming: Array<{ id: string; name: string; status: string | null; duedate: string | null; assignedStaff: string[] }>;
  compliance: {
    totalStaff: number;
    compliant: number; inProgress: number; attention: number; noData: number;
    verified: number; pending: number; expired: number; rejected: number; missing: number; mandatoryMissing: number;
  } | null;
}

export function OverviewTab() {
  // One lean call — counts + compliance + upcoming tasks are computed server-side.
  // RTK Query caches it, so bouncing between tabs serves from cache instead of
  // re-querying, and any compliance write invalidates it to refetch.
  const { data } = useGetOverviewQuery();
  const ov = data as OverviewData | undefined;

  const totalStaff = ov?.staff.total ?? 0;
  const verifiedStaff = ov?.staff.verified ?? 0;
  const totalCustomers = ov?.customers.total ?? 0;
  const activeCustomers = ov?.customers.active ?? 0;
  const totalTasks = ov?.tasks.total ?? 0;
  const completedTasks = ov?.tasks.closed ?? 0;
  const overdueTasks = ov?.tasks.overdue ?? 0;
  const totalProjects = ov?.projects.total ?? 0;
  const finishedProjects = ov?.projects.finished ?? 0;
  const timesheetsCount = ov?.timesheets.total ?? 0;
  const upcomingTasks = ov?.upcoming ?? [];
  const compliance = ov?.compliance ?? null;

  return (
    <div className="space-y-6 animate-fade-up">
      <section className="crm-panel p-5 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Executive Snapshot</p>
            <h2 className="mt-2 text-2xl md:text-3xl font-black tracking-tight text-text-primary">Operations Overview</h2>
            <p className="mt-2 text-sm text-text-secondary max-w-2xl">
              Daily visibility into staffing readiness, client activity, delivery pace, and open workload.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-500">
            <Activity className="h-4 w-4" />
            Live Data Sync
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <article className="crm-panel p-5">
          <p className="text-xs font-semibold text-text-muted">Staff Readiness</p>
          <div className="mt-3 flex items-center justify-between">
            <p className="text-3xl font-black text-text-primary">{verifiedStaff}<span className="text-sm ml-1 text-text-muted">/ {totalStaff}</span></p>
            <Users className="h-5 w-5 text-brand-primary" />
          </div>
          <p className="mt-2 text-xs text-text-muted">Verified mobile app users</p>
        </article>

        <article className="crm-panel p-5">
          <p className="text-xs font-semibold text-text-muted">Client Portfolio</p>
          <div className="mt-3 flex items-center justify-between">
            <p className="text-3xl font-black text-text-primary">{activeCustomers}<span className="text-sm ml-1 text-text-muted">/ {totalCustomers}</span></p>
            <Building2 className="h-5 w-5 text-brand-accent" />
          </div>
          <p className="mt-2 text-xs text-text-muted">Active customer accounts</p>
        </article>

        <article className="crm-panel p-5">
          <p className="text-xs font-semibold text-text-muted">Task Completion</p>
          <div className="mt-3 flex items-center justify-between">
            <p className="text-3xl font-black text-text-primary">{completedTasks}<span className="text-sm ml-1 text-text-muted">/ {totalTasks}</span></p>
            <ClipboardList className="h-5 w-5 text-brand-primary" />
          </div>
          <p className="mt-2 text-xs text-text-muted">Closed tasks</p>
        </article>

        <article className="crm-panel p-5">
          <p className="text-xs font-semibold text-text-muted">Projects Delivered</p>
          <div className="mt-3 flex items-center justify-between">
            <p className="text-3xl font-black text-text-primary">{finishedProjects}<span className="text-sm ml-1 text-text-muted">/ {totalProjects}</span></p>
            <Briefcase className="h-5 w-5 text-brand-accent" />
          </div>
          <p className="mt-2 text-xs text-text-muted">Finished project count</p>
        </article>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <article className="crm-panel p-5 xl:col-span-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-text-primary">Compliance Status</h3>
            <ShieldCheck className="h-4 w-4 text-text-muted" />
          </div>

          {!compliance ? (
            <p className="mt-6 text-xs text-text-muted">Loading compliance posture…</p>
          ) : (
            <div className="mt-5 space-y-5">
              {/* Staff posture */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2">Staff ({compliance.totalStaff})</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Compliant", value: compliance.compliant, cls: "text-emerald-600 dark:text-emerald-400" },
                    { label: "In progress", value: compliance.inProgress, cls: "text-amber-600 dark:text-amber-400" },
                    { label: "Attention", value: compliance.attention, cls: "text-rose-600 dark:text-rose-400" },
                    { label: "No data", value: compliance.noData, cls: "text-text-muted" },
                  ].map((t) => (
                    <div key={t.label} className="rounded-xl border border-border-card bg-surface-card p-3">
                      <p className={`text-2xl font-black ${t.cls}`}>{t.value}</p>
                      <p className="text-[11px] font-semibold text-text-muted mt-0.5">{t.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Requirement status across all staff */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2">Requirements</p>
                <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">Verified {compliance.verified}</span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">Pending {compliance.pending}</span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">Expired {compliance.expired}</span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-border-card text-text-muted">Missing {compliance.missing}</span>
                </div>
                {compliance.mandatoryMissing > 0 && (
                  <p className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {compliance.mandatoryMissing} mandatory requirement{compliance.mandatoryMissing === 1 ? "" : "s"} missing across staff.
                  </p>
                )}
              </div>
            </div>
          )}
        </article>

        <article className="crm-panel p-5 xl:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-text-primary">Immediate Attention</h3>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3">
              <p className="text-xs text-rose-500 font-bold">Overdue Tasks</p>
              <p className="mt-1 text-2xl font-black text-rose-500">{overdueTasks}</p>
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
              <p className="text-xs text-amber-600 dark:text-amber-400 font-bold">Unverified Staff</p>
              <p className="mt-1 text-2xl font-black text-amber-600 dark:text-amber-400">{Math.max(0, totalStaff - verifiedStaff)}</p>
            </div>

            <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-3">
              <p className="text-xs text-sky-600 dark:text-sky-400 font-bold">Timesheets</p>
              <p className="mt-1 text-2xl font-black text-sky-600 dark:text-sky-400">{timesheetsCount}</p>
            </div>
          </div>
        </article>
      </section>

      <section className="crm-panel p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-text-primary">Upcoming Task Queue</h3>
          {upcomingTasks.length > 0 && (
            <span className="text-xs text-text-muted">{upcomingTasks.length} scheduled next</span>
          )}
        </div>

        {!upcomingTasks.length ? (
          <div className="mt-6 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-600 dark:text-emerald-400">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="h-4 w-4" />
              No active tasks scheduled.
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {upcomingTasks.map((task) => {
              const overdue = task.duedate && new Date(task.duedate) < new Date();
              return (
                <div
                  key={task.id}
                  className="rounded-xl border border-border-card bg-surface-card hover:bg-black/10 dark:hover:bg-white/[0.04] p-3 flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary line-clamp-1">{task.name || `Task #${task.id}`}</p>
                    <p className="text-xs text-text-muted mt-0.5">{task.assignedStaff?.join(", ") || "Unassigned"}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-xs font-semibold ${overdue ? "text-rose-500 dark:text-rose-400" : "text-text-secondary"}`}>
                      {task.duedate || "No deadline"}
                    </p>
                    <div className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border border-border-card text-text-muted">
                      <ShieldAlert className="h-3 w-3" />
                      Status {task.status || "N/A"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}