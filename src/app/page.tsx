"use client";

import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import { LogOut, Users, UsersRound, Building2, ClipboardList, Clock, RefreshCw, Menu, X, Play, Square } from "lucide-react";
import { cn } from "@/lib/utils";

import { StaffTab } from "./tabs/StaffTab";
import { CustomersTab } from "./tabs/CustomersTab";
import { ContactsTab } from "./tabs/ContactsTab";
import { TasksTab } from "./tabs/TasksTab";
import { TimesheetsTab } from "./tabs/TimesheetsTab";
import { ProjectsTab } from "./tabs/ProjectsTab";

type TabOption = "staff" | "customers" | "contacts" | "tasks" | "timesheets" | "projects";

export default function Dashboard() {
  const { data: session, status } = useSession();
  const [activeTab, setActiveTab] = useState<TabOption>("staff");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [cronStatus, setCronStatus] = useState<{ isActive: boolean } | null>(null);
  const [isTogglingCron, setIsTogglingCron] = useState(false);

  // Fetch initial cron status on mount
  useEffect(() => {
    fetch('/api/cron')
      .then(res => res.json())
      .then(data => setCronStatus(data))
      .catch(err => console.error("Failed to fetch cron status:", err));
  }, []);

  const handleToggleCron = async () => {
    if (!cronStatus) return;
    setIsTogglingCron(true);
    const action = cronStatus.isActive ? 'stop' : 'start';
    try {
      const res = await fetch('/api/cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok) {
        setCronStatus({ isActive: data.isActive });
      } else {
        alert(data.error || 'Failed to toggle cron status.');
      }
    } catch (err) {
      console.error(err);
      alert('Error communicating with cron API.');
    } finally {
      setIsTogglingCron(false);
    }
  };

  const handleGlobalSync = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/sync/all', { method: 'POST' });
      const data = await response.json();
      if (response.ok) {
        alert('Global sync completed! Check console for detailed results.');
        console.log('Global Sync Results:', data.results);
      } else {
        alert(`Global sync failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to run global sync:', error);
      alert('Failed to run global sync. Check console for details.');
    } finally {
      setIsSyncing(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Access Denied</h2>
        <a href="/login" className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold">Go to Login</a>
      </div>
    );
  }

  const tabs = [
    { id: "staff", label: "Staff", icon: Users },
    { id: "customers", label: "Customers", icon: Building2 },
    { id: "contacts", label: "Contacts", icon: UsersRound },
    { id: "projects", label: "Projects", icon: ClipboardList },
    { id: "tasks", label: "Tasks", icon: ClipboardList },
    { id: "timesheets", label: "Timesheets", icon: Clock },
  ] as const;

  const SidebarContent = () => (
    <>
      <div className="p-6 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Pristine CRM
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 truncate">
          Welcome, <span className="font-semibold">{session?.user?.name}</span>
        </p>
      </div>

      <div className="p-4 flex-1 space-y-1 overflow-y-auto">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 mt-2 px-2">Navigation</div>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id as TabOption); setMobileMenuOpen(false); }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium text-sm transition-all",
                activeTab === tab.id
                  ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50"
              )}
            >
              <Icon className={cn("h-5 w-5", activeTab === tab.id ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400")} />
              {tab.label}
            </button>
          );
        })}

        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 mt-8 px-2 flex justify-between items-center">
          Options & Actions
          {cronStatus !== null && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">
              <div className={`w-2 h-2 rounded-full ${cronStatus.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></div>
              <span className="text-[10px] uppercase font-bold text-slate-500">Auto</span>
            </div>
          )}
        </div>

        <button
          onClick={handleToggleCron}
          disabled={isTogglingCron || cronStatus === null}
          className={cn(
            "w-full flex items-center justify-start gap-3 px-3 py-2 rounded-lg font-medium text-sm transition-all text-slate-600 dark:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed",
            cronStatus?.isActive
              ? "hover:bg-amber-50 dark:hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400"
              : "hover:bg-emerald-50 dark:hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400"
          )}
        >
          {cronStatus?.isActive ? <Square className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          {cronStatus?.isActive ? 'Stop Auto-Sync' : 'Start Auto-Sync'}
        </button>

        <button
          onClick={handleGlobalSync}
          disabled={isSyncing}
          className="w-full flex items-center justify-start gap-3 px-3 py-2 mt-1 rounded-lg font-medium text-sm transition-all text-slate-600 dark:text-slate-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={cn("h-5 w-5", isSyncing && "animate-spin text-indigo-500")} />
          {isSyncing ? 'Syncing All Data...' : 'Manual Sync All'}
        </button>
      </div>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800">
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
        >
          <LogOut className="h-5 w-5" /> Sign Out
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex font-sans">

      {/* Desktop Sidebar */}
      <aside className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex-col hidden md:flex shrink-0">
        <SidebarContent />
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">

        {/* Mobile Header Sidebar Toggle */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Pristine CRM</h1>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-slate-600 dark:text-slate-300">
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </header>

        {/* Mobile Sidebar Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden absolute top-[73px] left-0 right-0 bottom-0 bg-white dark:bg-slate-900 z-50 flex flex-col">
            <SidebarContent />
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-50 dark:bg-slate-950">
          <div className="max-w-6xl mx-auto">
            {/* Dynamic Tab Content */}
            {activeTab === "staff" && <StaffTab />}
            {activeTab === "customers" && <CustomersTab />}
            {activeTab === "contacts" && <ContactsTab />}
            {activeTab === "projects" && <ProjectsTab />}
            {activeTab === "tasks" && <TasksTab />}
            {activeTab === "timesheets" && <TimesheetsTab />}
          </div>
        </main>
      </div>
    </div>
  );
}
