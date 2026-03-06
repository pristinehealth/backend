"use client";

import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import { LogOut, Users, UsersRound, Building2, ClipboardList, RefreshCw, Menu, X, Play, Square, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

import { StaffTab } from "./tabs/StaffTab";
import { CustomersTab } from "./tabs/CustomersTab";
import { ContactsTab } from "./tabs/ContactsTab";
import { TasksTab } from "./tabs/TasksTab";
import { ProjectsTab } from "./tabs/ProjectsTab";

type TabOption = "staff" | "customers" | "contacts" | "tasks" | "projects";

export default function Dashboard() {
  const { data: session, status } = useSession();
  const [activeTab, setActiveTab] = useState<TabOption>("staff");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [cronStatus, setCronStatus] = useState<{ isActive: boolean; currentMode?: string; scheduledHour?: number; intervalMinutes?: number } | null>(null);
  const [isTogglingCron, setIsTogglingCron] = useState(false);
  const [syncMode, setSyncMode] = useState<'daily' | 'interval'>('daily');
  const [syncHour, setSyncHour] = useState<number>(2);
  // intervalInput is the raw string the user types (avoids parseInt||1 killing backspace)
  const [intervalInput, setIntervalInput] = useState<string>('60');
  const [intervalUnit, setIntervalUnit] = useState<'mins' | 'hrs'>('mins');
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  // Fetch initial cron status on mount
  useEffect(() => {
    fetch('/api/cron')
      .then(res => res.json())
      .then(data => {
        setCronStatus(data);
        if (data.currentMode) setSyncMode(data.currentMode);
        if (data.scheduledHour !== undefined) setSyncHour(data.scheduledHour);
        if (data.intervalMinutes !== undefined) {
          // Convert stored minutes to the display unit value
          const isHrs = data.intervalMinutes % 60 === 0 && data.intervalMinutes >= 60;
          const unit = isHrs ? 'hrs' : 'mins';
          const displayVal = isHrs ? data.intervalMinutes / 60 : data.intervalMinutes;
          setIntervalUnit(unit);
          setIntervalInput(String(displayVal));
        }
      })
      .catch(err => console.error("Failed to fetch cron status:", err));
  }, []);

  // Helper: compute final minutes from the string input + unit
  const computeIntervalMinutes = () => {
    const val = Math.max(1, parseInt(intervalInput, 10) || 1);
    return intervalUnit === 'hrs' ? val * 60 : val;
  };

  // Switch unit while preserving the effective duration
  const handleUnitSwitch = (newUnit: 'mins' | 'hrs') => {
    if (newUnit === intervalUnit) return;
    const currentMins = computeIntervalMinutes();
    if (newUnit === 'hrs') {
      setIntervalInput(String(Math.round(currentMins / 60) || 1));
    } else {
      setIntervalInput(String(currentMins));
    }
    setIntervalUnit(newUnit);
  };

  // Shared save-schedule logic used by both "Save Schedule" button and Start Auto-Sync
  const saveSchedule = async () => {
    const intervalMinutes = computeIntervalMinutes();
    const body: any = { action: 'reschedule', mode: syncMode };
    if (syncMode === 'daily') body.hour = syncHour;
    else body.intervalMinutes = intervalMinutes;
    const res = await fetch('/api/cron', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save schedule.');
    setCronStatus(prev => prev ? { ...prev, currentMode: syncMode, scheduledHour: syncHour, intervalMinutes } : prev);
    return data;
  };

  const handleToggleCron = async () => {
    if (!cronStatus) return;
    setIsTogglingCron(true);
    try {
      if (!cronStatus.isActive) {
        // Save current schedule to DB first so the cron arms with what the UI shows
        await saveSchedule();
      }
      const action = cronStatus.isActive ? 'stop' : 'start';
      const res = await fetch('/api/cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok) {
        setCronStatus(prev => prev ? { ...prev, isActive: data.isActive } : { isActive: data.isActive });
      } else {
        alert(data.error || 'Failed to toggle cron status.');
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error communicating with cron API.');
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-blue"></div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Access Denied</h2>
        <a href="/login" className="bg-brand-blue text-white px-6 py-2 rounded-xl font-bold">Go to Login</a>
      </div>
    );
  }

  const tabs = [
    { id: "staff", label: "Staff", icon: Users },
    { id: "customers", label: "Customers", icon: Building2 },
    { id: "contacts", label: "Contacts", icon: UsersRound },
    { id: "projects", label: "Projects", icon: ClipboardList },
    { id: "tasks", label: "Tasks", icon: ClipboardList },
  ] as const;

  const SidebarContent = () => (
    <>
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-center">
        <img src="/logo.png" alt="Pristine Health" className="h-16 w-auto" />
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
                  ? "bg-brand-blue-muted dark:bg-brand-blue-light/10 text-brand-blue dark:text-brand-blue-light border-l-2 border-brand-orange"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 border-l-2 border-transparent"
              )}
            >
              <Icon className={cn("h-5 w-5", activeTab === tab.id ? "text-brand-orange" : "text-slate-400")} />
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

        {/* Sync Schedule Widget */}
        <div className="mt-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Sync Schedule</span>
          </div>

          {/* Mode Toggle */}
          <div className="flex rounded-md overflow-hidden border border-slate-200 dark:border-slate-700 mb-2 text-xs font-semibold">
            {(['daily', 'interval'] as const).map(m => (
              <button
                key={m}
                onClick={() => setSyncMode(m)}
                className={cn(
                  "flex-1 py-1 capitalize transition-colors",
                  syncMode === m
                    ? "bg-brand-blue text-white"
                    : "bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                )}
              >{m}</button>
            ))}
          </div>

          {syncMode === 'daily' ? (
            <select
              value={syncHour}
              onChange={e => setSyncHour(parseInt(e.target.value, 10))}
              className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-blue mb-2"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00 — {h === 0 ? 'Midnight' : h < 12 ? `${h} AM` : h === 12 ? 'Noon' : `${h - 12} PM`}
                </option>
              ))}
            </select>
          ) : (
            <div className="mb-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={intervalInput}
                  onChange={e => {
                    // Allow free typing — don't force minimum until save
                    const v = e.target.value.replace(/[^0-9]/g, '');
                    setIntervalInput(v);
                  }}
                  onBlur={() => {
                    // Clamp to minimum of 1 on blur
                    const v = Math.max(1, parseInt(intervalInput, 10) || 1);
                    setIntervalInput(String(v));
                  }}
                  className="w-20 text-sm border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-blue"
                />
                {/* Unit toggle: mins / hrs */}
                <div className="flex rounded-md overflow-hidden border border-slate-200 dark:border-slate-700 text-xs font-semibold">
                  {(['mins', 'hrs'] as const).map(u => (
                    <button
                      key={u}
                      onClick={() => handleUnitSwitch(u)}
                      className={cn(
                        "px-2 py-1 transition-colors",
                        intervalUnit === u
                          ? "bg-brand-blue text-white"
                          : "bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                      )}
                    >{u}</button>
                  ))}
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Fires every {intervalInput || '?'} {intervalUnit}
                {intervalUnit === 'hrs'
                  ? ` (${(parseInt(intervalInput, 10) || 0) * 60} mins)`
                  : (parseInt(intervalInput, 10) || 0) >= 60
                    ? ` (${((parseInt(intervalInput, 10) || 0) / 60).toFixed(1)}h)`
                    : ''}
              </p>
            </div>
          )}

          <button
            onClick={async () => {
              setIsSavingSchedule(true);
              try {
                await saveSchedule();
              } catch (err: any) {
                alert(err.message || 'Failed to reschedule.');
              } finally {
                setIsSavingSchedule(false);
              }
            }}
            disabled={isSavingSchedule}
            className="w-full py-1.5 rounded-md text-xs font-bold bg-brand-blue text-white hover:bg-brand-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSavingSchedule ? 'Saving...' : 'Save Schedule'}
          </button>
        </div>


        <button
          onClick={handleGlobalSync}
          disabled={isSyncing}
          className="w-full flex items-center justify-start gap-3 px-3 py-2 mt-1 rounded-lg font-medium text-sm transition-all text-slate-600 dark:text-slate-400 hover:bg-brand-blue-muted dark:hover:bg-brand-blue-light/10 hover:text-brand-blue dark:hover:text-brand-blue-light disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={cn("h-5 w-5", isSyncing && "animate-spin text-brand-blue-light")} />
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
          </div>
        </main>
      </div>
    </div>
  );
}
