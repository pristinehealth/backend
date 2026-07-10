"use client";

import { useSession, signOut } from "next-auth/react";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  LogOut, Users, UsersRound, Building2, ClipboardList, Briefcase, Settings,
  Menu, X, Sun, Moon, Loader2, LayoutDashboard, Sparkles, ShieldCheck
} from "lucide-react";

import { cn } from "@/lib/utils";

import { StaffTab } from "../tabs/StaffTab";
import { CustomersTab } from "../tabs/CustomersTab";
import { ContactsTab } from "../tabs/ContactsTab";
import { TasksTab } from "../tabs/TasksTab";
import { ProjectsTab } from "../tabs/ProjectsTab";
import { JobsTab } from "../tabs/JobsTab";
import { SettingsTab } from "../tabs/SettingsTab";
import { OverviewTab } from "../tabs/OverviewTab";
import { ComplianceTab } from "../tabs/ComplianceTab";

type TabOption = "overview" | "staff" | "customers" | "contacts" | "tasks" | "projects" | "jobs" | "compliance" | "settings";

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabOption>("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  // Initialize theme from document class
  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setTheme(isDark ? 'dark' : 'light');
  }, []);

  // Honor a deep-link like /dashboard?tab=compliance on first load (also how the
  // active tab is restored after a page reload).
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    const valid: TabOption[] = ["overview", "staff", "customers", "contacts", "tasks", "projects", "jobs", "compliance", "settings"];
    if (tab && (valid as string[]).includes(tab)) {
      setActiveTab(tab as TabOption);
    }
  }, []);

  // Keep the URL in sync with the active tab so a reload lands on the same tab.
  // Skip the initial run: on mount `activeTab` is still the default "overview",
  // and writing that would clobber a deep-link (?tab=compliance) before the read
  // effect above applies it — sending you to Overview instead.
  const tabSyncReady = useRef(false);
  useEffect(() => {
    if (!tabSyncReady.current) {
      tabSyncReady.current = true;
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === activeTab) return;
    params.set("tab", activeTab);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [activeTab]);

  // Automatic redirect to login if unauthenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/dashboard");
    }
  }, [status, router]);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.theme = nextTheme;
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <Loader2 className="h-10 w-10 text-brand-primary animate-spin" />
      </div>
    );
  }

  const tabs = [
    { id: "overview", label: "Overview", icon: LayoutDashboard, description: "Executive summary" },
    { id: "staff", label: "Staff", icon: Users, description: "Team directory & compliance" },
    { id: "customers", label: "Customers", icon: Building2, description: "Client accounts" },
    { id: "contacts", label: "Contacts", icon: UsersRound, description: "Contact records" },
    { id: "projects", label: "Projects", icon: ClipboardList, description: "Projects & delivery" },
    { id: "tasks", label: "Tasks", icon: ClipboardList, description: "Tasks & service reports" },
    { id: "jobs", label: "Jobs", icon: Briefcase, description: "Postings & applications" },
    { id: "compliance", label: "Compliance", icon: ShieldCheck, description: "Requirements & credentials" },
    { id: "settings", label: "Settings", icon: Settings, description: "Account & system" },
  ] as const;

  const activeTabMeta = tabs.find((tab) => tab.id === activeTab);

  const SidebarContent = () => (
    <>
      <div className="p-4 border-b border-sidebar-border flex items-center justify-center bg-black/20">
        <img src="/logo.png" alt="Pristine Health Logo" className="h-12 w-auto brightness-110" />
      </div>

      <div className="p-4 flex-1 space-y-1 overflow-y-auto">
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3 px-2">
            Navigation
        </div>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id as TabOption); setMobileMenuOpen(false); }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold text-sm transition-all border border-transparent",
                activeTab === tab.id
                  ? "bg-brand-primary-muted text-brand-primary border-brand-primary/25 shadow-sm"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-white/[0.03] hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <Icon className={cn("h-4.5 w-4.5", activeTab === tab.id ? "text-brand-primary" : "text-slate-500 dark:text-slate-400")} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="p-4 border-t border-sidebar-border space-y-1">
        {/* Explicit Light/Dark mode toggle */}
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-white/[0.03] hover:text-slate-900 dark:hover:text-white border border-transparent transition-all"
        >
          {theme === 'dark' ? <Sun className="h-4.5 w-4.5 text-amber-500" /> : <Moon className="h-4.5 w-4.5 text-indigo-500" />}
          Toggle {theme === 'dark' ? 'Light' : 'Dark'} Mode
        </button>

        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold text-sm text-rose-500 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-300 border border-transparent hover:border-rose-500/25 transition-all"
        >
          <LogOut className="h-4.5 w-4.5" /> Sign Out
        </button>
      </div>
    </>
  );

  return (
    <div className="h-full min-h-screen bg-background text-foreground flex font-sans relative overflow-hidden">
      
      {/* Ambient background glows matching landing page rebrand */}
      <div className="absolute top-[-300px] left-1/3 w-[800px] h-[600px] bg-brand-primary-muted rounded-full blur-[150px] pointer-events-none animate-float-slow opacity-40"></div>
      <div className="absolute bottom-[-200px] right-1/4 w-[700px] h-[500px] bg-brand-accent-muted rounded-full blur-[140px] pointer-events-none opacity-40"></div>

      {/* Subtle Grid Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.012)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.012)_1px,transparent_1px)] bg-[size:56px_56px] pointer-events-none"></div>

      {/* Desktop Sidebar */}
      <aside className="w-64 bg-sidebar-bg border-r border-sidebar-border flex-col hidden md:flex shrink-0 relative z-10 backdrop-blur-md">
        <SidebarContent />
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden relative z-10">

        {/* Mobile Header Sidebar Toggle */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-sidebar-border bg-sidebar-bg shrink-0">
          <h1 className="text-lg font-bold text-foreground tracking-tight">Pristine CRM</h1>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-slate-600 dark:text-slate-300 hover:text-brand-primary">
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </header>

        {/* Mobile Sidebar Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden absolute top-[73px] left-0 right-0 bottom-0 bg-sidebar-bg z-50 flex flex-col border-t border-sidebar-border">
            <SidebarContent />
          </div>
        )}

        <main className="flex-1 min-h-0 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-5">
            <section className="crm-panel p-4 md:p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Pristine Health Staffing</p>
                  <h1 className="mt-1 text-2xl md:text-3xl font-black tracking-tight text-text-primary">
                    {activeTabMeta?.label || "Dashboard"}
                  </h1>
                  <p className="mt-1 text-sm text-text-secondary">
                    {activeTabMeta?.description || "Core operations workspace for staffing, clients, delivery, and system controls."}
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-xl border border-brand-primary/20 bg-brand-primary-muted px-3 py-2 text-xs font-bold text-brand-primary">
                  <Sparkles className="h-4 w-4" />
                  Healthcare CRM Workspace
                </div>
              </div>
            </section>

            <section className="flex-1 min-h-0">
            {/* Dynamic Tab Content */}
            {activeTab === "overview" && <OverviewTab />}
            {activeTab === "staff" && <StaffTab />}
            {activeTab === "customers" && <CustomersTab />}
            {activeTab === "contacts" && <ContactsTab />}
            {activeTab === "projects" && <ProjectsTab />}
            {activeTab === "tasks" && <TasksTab />}
            {activeTab === "jobs" && <JobsTab />}
            {activeTab === "compliance" && <ComplianceTab />}
            {activeTab === "settings" && <SettingsTab />}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
