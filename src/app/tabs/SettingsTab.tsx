"use client";

import { useState, useEffect } from "react";
import { 
    Play, Square, Clock, RefreshCw, Settings, Sliders, Info, Loader2, HelpCircle, Mail, Bell
} from "lucide-react";
import { cn } from "@/lib/utils";

export function SettingsTab() {
    const [isSyncing, setIsSyncing] = useState(false);
    const [cronStatus, setCronStatus] = useState<{ isActive: boolean; currentMode?: string; scheduledHour?: number; intervalMinutes?: number } | null>(null);
    const [isTogglingCron, setIsTogglingCron] = useState(false);
    const [syncMode, setSyncMode] = useState<'daily' | 'interval'>('daily');
    const [syncHour, setSyncHour] = useState<number>(2);
    const [intervalInput, setIntervalInput] = useState<string>('60');
    const [intervalUnit, setIntervalUnit] = useState<'mins' | 'hrs'>('mins');
    const [isSavingSchedule, setIsSavingSchedule] = useState(false);
    const [notifyStatusChange, setNotifyStatusChange] = useState(true);
    const [notifyReviewerNotes, setNotifyReviewerNotes] = useState(true);
    const [isSavingNotifications, setIsSavingNotifications] = useState(false);

    // Fetch initial cron status and notification preferences on mount
    useEffect(() => {
        Promise.all([
            fetch('/api/cron').then(res => res.json()),
            fetch('/api/settings').then(res => res.json())
        ])
            .then(([cronData, settingsData]) => {
                setCronStatus(cronData);
                if (cronData.currentMode) setSyncMode(cronData.currentMode);
                if (cronData.scheduledHour !== undefined) setSyncHour(cronData.scheduledHour);
                if (cronData.intervalMinutes !== undefined) {
                    const isHrs = cronData.intervalMinutes % 60 === 0 && cronData.intervalMinutes >= 60;
                    const unit = isHrs ? 'hrs' : 'mins';
                    const displayVal = isHrs ? cronData.intervalMinutes / 60 : cronData.intervalMinutes;
                    setIntervalUnit(unit);
                    setIntervalInput(String(displayVal));
                }

                if (settingsData.settings) {
                    setNotifyStatusChange(settingsData.settings['app_notify_status_change'] !== 'false');
                    setNotifyReviewerNotes(settingsData.settings['app_notify_reviewer_notes'] !== 'false');
                }
            })
            .catch(err => console.error("Failed to fetch settings:", err));
    }, []);

    const saveNotificationPreferences = async () => {
        setIsSavingNotifications(true);
        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    app_notify_status_change: String(notifyStatusChange),
                    app_notify_reviewer_notes: String(notifyReviewerNotes)
                })
            });
            if (res.ok) {
                alert('Notification preferences saved successfully.');
            } else {
                alert('Failed to save notification preferences.');
            }
        } catch (err: any) {
            console.error(err);
            alert('Error saving notification preferences.');
        } finally {
            setIsSavingNotifications(false);
        }
    };

    const computeIntervalMinutes = () => {
        const val = Math.max(1, parseInt(intervalInput, 10) || 1);
        return intervalUnit === 'hrs' ? val * 60 : val;
    };

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

    return (
        <div className="space-y-6 max-w-4xl">
            {/* Header */}
            <div className="border-b border-sidebar-border pb-3">
                <h2 className="text-xl font-bold tracking-tight text-text-primary">System Settings</h2>
                <p className="text-xs text-text-muted mt-1">Configure global synchronization parameters, schedules, and developer settings.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Sync Schedule Card */}
                <div className="bg-gradient-to-b from-white/[0.04] to-white/[0.01] border border-sidebar-border rounded-2xl p-5 shadow-sm space-y-4">
                    <h3 className="font-bold text-sm text-text-primary flex items-center gap-2">
                        <Clock className="h-4.5 w-4.5 text-cyan-500" /> Synchronization Scheduler
                    </h3>
                    
                    <p className="text-xs text-text-secondary leading-relaxed">
                        Control how often the CRM syncs data automatically with the primary service providers.
                    </p>

                    <div className="space-y-3">
                        <div className="flex rounded-xl overflow-hidden border border-sidebar-border text-xs font-bold w-48">
                            {(['daily', 'interval'] as const).map(m => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => setSyncMode(m)}
                                    className={cn(
                                        "flex-1 py-1.5 capitalize transition-colors",
                                        syncMode === m
                                            ? "bg-cyan-500 text-white"
                                            : "bg-slate-200 dark:bg-black/30 text-slate-600 dark:text-slate-500 hover:bg-slate-300 dark:hover:bg-white/[0.02]"
                                    )}
                                >{m}</button>
                            ))}
                        </div>

                        {syncMode === 'daily' ? (
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-text-muted uppercase">Select Daily Hour</label>
                                <select
                                    value={syncHour}
                                    onChange={e => setSyncHour(parseInt(e.target.value, 10))}
                                    className="w-full text-xs border border-sidebar-border rounded-xl px-3 py-2 bg-bg-input text-text-primary focus:border-cyan-500 outline-none"
                                >
                                    {Array.from({ length: 24 }, (_, h) => (
                                        <option key={h} value={h} className="bg-white dark:bg-[#101830] text-slate-800 dark:text-slate-200">
                                            {String(h).padStart(2, '0')}:00 — {h === 0 ? 'Midnight' : h < 12 ? `${h} AM` : h === 12 ? 'Noon' : `${h - 12} PM`}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-text-muted uppercase block">Set Sync Interval</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={intervalInput}
                                        onChange={e => {
                                            const v = e.target.value.replace(/[^0-9]/g, '');
                                            setIntervalInput(v);
                                        }}
                                        onBlur={() => {
                                            const v = Math.max(1, parseInt(intervalInput, 10) || 1);
                                            setIntervalInput(String(v));
                                        }}
                                        className="w-20 text-xs border border-sidebar-border rounded-xl px-3 py-2 bg-bg-input text-text-primary focus:border-cyan-500 outline-none"
                                    />
                                    <div className="flex rounded-xl overflow-hidden border border-sidebar-border text-[10px] font-bold">
                                        {(['mins', 'hrs'] as const).map(u => (
                                            <button
                                                key={u}
                                                type="button"
                                                onClick={() => handleUnitSwitch(u)}
                                                className={cn(
                                                    "px-2.5 py-1.5 transition-colors",
                                                    intervalUnit === u
                                                        ? "bg-cyan-500 text-white"
                                                        : "bg-slate-200 dark:bg-black/30 text-slate-600 dark:text-slate-500 hover:bg-slate-300 dark:hover:bg-white/[0.02]"
                                                )}
                                            >{u}</button>
                                        ))}
                                    </div>
                                </div>
                                <p className="text-[10px] text-text-muted italic">
                                    Sync will fire every {intervalInput || '?'} {intervalUnit}.
                                </p>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={async () => {
                                setIsSavingSchedule(true);
                                try {
                                    await saveSchedule();
                                    alert('Sync schedule saved successfully.');
                                } catch (err: any) {
                                    alert(err.message || 'Failed to reschedule.');
                                } finally {
                                    setIsSavingSchedule(false);
                                }
                            }}
                            disabled={isSavingSchedule}
                            className="bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-md shadow-cyan-500/10 active:scale-95"
                        >
                            {isSavingSchedule ? 'Saving...' : 'Save Sync Schedule'}
                        </button>
                    </div>
                </div>

                {/* Operations & Control Card */}
                <div className="bg-gradient-to-b from-white/[0.04] to-white/[0.01] border border-sidebar-border rounded-2xl p-5 shadow-sm space-y-5">
                    <h3 className="font-bold text-sm text-text-primary flex items-center gap-2">
                        <Sliders className="h-4.5 w-4.5 text-cyan-500" /> Sync Control Panel
                    </h3>

                    <p className="text-xs text-text-secondary leading-relaxed">
                        Control the background worker engine status and run ad-hoc synchronization jobs across all provider tables.
                    </p>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center bg-slate-100 dark:bg-black/25 border border-sidebar-border p-3.5 rounded-xl">
                            <div>
                                <span className="text-xs font-bold text-text-primary block">Automatic Cron Sync</span>
                                <span className="text-[10px] text-text-muted mt-0.5 block">Toggle standard backend tick actions.</span>
                            </div>
                            {cronStatus !== null ? (
                                <button
                                    type="button"
                                    onClick={handleToggleCron}
                                    disabled={isTogglingCron}
                                    className="flex items-center gap-1.5 text-xs font-bold"
                                >
                                    {cronStatus.isActive ? (
                                        <>
                                            <Square className="h-4.5 w-4.5 text-amber-500" />
                                            <span className="text-amber-500">Stop Sync</span>
                                        </>
                                    ) : (
                                        <>
                                            <Play className="h-4.5 w-4.5 text-emerald-500" />
                                            <span className="text-emerald-500">Start Sync</span>
                                        </>
                                    )}
                                </button>
                            ) : (
                                <Loader2 className="h-5 w-5 text-cyan-500 animate-spin" />
                            )}
                        </div>

                        <div className="flex justify-between items-center bg-slate-100 dark:bg-black/25 border border-sidebar-border p-3.5 rounded-xl">
                            <div>
                                <span className="text-xs font-bold text-text-primary block">Manual Full Database Sync</span>
                                <span className="text-[10px] text-text-muted mt-0.5 block">Download all data records immediately.</span>
                            </div>
                            <button
                                type="button"
                                onClick={handleGlobalSync}
                                disabled={isSyncing}
                                className="bg-white/10 dark:bg-white/[0.04] border border-sidebar-border hover:bg-cyan-500/10 dark:hover:bg-cyan-500/10 hover:text-cyan-600 dark:hover:text-cyan-400 text-text-secondary px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50"
                            >
                                <RefreshCw className={cn("h-3.5 w-3.5", isSyncing && "animate-spin text-cyan-500")} />
                                {isSyncing ? 'Syncing...' : 'Sync All'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Notification Preferences Card */}
                <div className="bg-gradient-to-b from-white/[0.04] to-white/[0.01] border border-sidebar-border rounded-2xl p-5 shadow-sm space-y-4 md:col-span-2">
                    <h3 className="font-bold text-sm text-text-primary flex items-center gap-2">
                        <Bell className="h-4.5 w-4.5 text-cyan-500" /> Email Notifications
                    </h3>

                    <p className="text-xs text-text-secondary leading-relaxed">
                        Control when email notifications are sent for job applications.
                    </p>

                    <div className="space-y-3">
                        <div className="flex justify-between items-center bg-slate-100 dark:bg-black/25 border border-sidebar-border p-3.5 rounded-xl">
                            <div>
                                <span className="text-xs font-bold text-text-primary block">Status Change Emails</span>
                                <span className="text-[10px] text-text-muted mt-0.5 block">Notify candidates when application status is updated.</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setNotifyStatusChange(!notifyStatusChange)}
                                className={cn(
                                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                                    notifyStatusChange ? "bg-emerald-500" : "bg-slate-400"
                                )}
                            >
                                <span
                                    className={cn(
                                        "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                                        notifyStatusChange ? "translate-x-6" : "translate-x-1"
                                    )}
                                />
                            </button>
                        </div>

                        <div className="flex justify-between items-center bg-slate-100 dark:bg-black/25 border border-sidebar-border p-3.5 rounded-xl">
                            <div>
                                <span className="text-xs font-bold text-text-primary block">Reviewer Note Notifications</span>
                                <span className="text-[10px] text-text-muted mt-0.5 block">Notify admins when reviewer notes are added to applications.</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setNotifyReviewerNotes(!notifyReviewerNotes)}
                                className={cn(
                                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                                    notifyReviewerNotes ? "bg-emerald-500" : "bg-slate-400"
                                )}
                            >
                                <span
                                    className={cn(
                                        "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                                        notifyReviewerNotes ? "translate-x-6" : "translate-x-1"
                                    )}
                                />
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={saveNotificationPreferences}
                            disabled={isSavingNotifications}
                            className="bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-md shadow-cyan-500/10 active:scale-95 w-full md:w-auto"
                        >
                            {isSavingNotifications ? 'Saving...' : 'Save Notification Preferences'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
