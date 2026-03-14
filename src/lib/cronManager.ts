/**
 * Singleton Cron Manager for Next.js.
 *
 * Two scheduling modes (stored in Settings collection):
 *   sync_mode = 'daily'    — fires once at sync_hour (0–23) every day
 *   sync_mode = 'interval' — fires every sync_interval_minutes minutes
 *
 * Falls back to SYNC_HOUR env var / 2 AM daily if no DB settings exist.
 */

import dbConnect from '@/lib/mongoose';
import Settings from '@/models/Settings';

interface SyncConfig {
    mode: 'daily' | 'interval';
    hour: number;          // for daily mode
    intervalMinutes: number; // for interval mode
}

async function getSyncConfig(): Promise<SyncConfig> {
    try {
        await dbConnect();
        const docs = await Settings.find({ key: { $in: ['sync_mode', 'sync_hour', 'sync_interval_minutes'] } });
        const map: Record<string, string> = {};
        for (const d of docs) map[d.key] = d.value;

        const mode = (map['sync_mode'] || 'daily') as 'daily' | 'interval';
        const hour = parseInt(map['sync_hour'] ?? process.env.SYNC_HOUR ?? '2', 10);
        const intervalMinutes = parseInt(map['sync_interval_minutes'] ?? '60', 10);

        return {
            mode,
            hour: isNaN(hour) ? 2 : Math.max(0, Math.min(23, hour)),
            intervalMinutes: isNaN(intervalMinutes) ? 60 : Math.max(1, intervalMinutes),
        };
    } catch {
        return { mode: 'daily', hour: parseInt(process.env.SYNC_HOUR ?? '2', 10), intervalMinutes: 60 };
    }
}

class CronManager {
    private timerId: NodeJS.Timeout | null = null;
    public isActive: boolean = false;

    // Reflect current schedule in getStatus()
    public currentMode: 'daily' | 'interval' = 'daily';
    public scheduledHour: number = 2;
    public intervalMinutes: number = 60;

    public start() {
        if (this.timerId) clearTimeout(this.timerId);
        this.isActive = true;
        this.scheduleNext();
    }

    /**
     * Called on server boot (first DB connect).
     * Fires an immediate full sync then arms the normal schedule.
     * The schedule is always armed via .finally() — sync failure won't prevent it.
     */
    public startWithImmediateSync() {
        if (this.timerId) clearTimeout(this.timerId);
        this.isActive = true;

        const baseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
        console.log('[CronManager] Server boot — running immediate startup sync...');

        fetch(`${baseUrl}/api/sync/all`, { method: 'POST' })
            .then(async (res) => {
                if (!res.ok) {
                    console.error(`[CronManager] Startup sync failed with status: ${res.status}`);
                } else {
                    const data = await res.json();
                    console.log('[CronManager] Startup sync completed.', JSON.stringify(data.results));
                }
            })
            .catch((err: any) => {
                console.error('[CronManager] Startup sync error:', err.message);
            })
            .finally(() => {
                // Always arm the regular schedule after startup sync, win or lose
                if (this.isActive) this.scheduleNext();
            });
    }

    private scheduleNext() {
        getSyncConfig().then((cfg) => {
            if (!this.isActive) return;

            this.currentMode = cfg.mode;
            this.scheduledHour = cfg.hour;
            this.intervalMinutes = cfg.intervalMinutes;

            let msUntil: number;

            if (cfg.mode === 'interval') {
                msUntil = cfg.intervalMinutes * 60 * 1000;
                console.log(`[CronManager] Interval sync armed — runs every ${cfg.intervalMinutes} min.`);
            } else {
                // Daily mode: next occurrence of cfg.hour:00
                const now = new Date();
                const next = new Date(now);
                next.setHours(cfg.hour, 0, 0, 0);
                if (next <= now) next.setDate(next.getDate() + 1);
                msUntil = next.getTime() - now.getTime();
                console.log(`[CronManager] Daily sync armed — next run at ${String(cfg.hour).padStart(2, '0')}:00 (in ${Math.round(msUntil / 60000)} min).`);
            }

            this.timerId = setTimeout(async () => {
                if (!this.isActive) return;
                console.log(`[CronManager] Running maintenance sync (mode: ${cfg.mode})...`);
                const baseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
                try {
                    const res = await fetch(`${baseUrl}/api/sync/all`, { method: 'POST' });
                    if (!res.ok) {
                        console.error(`[CronManager] Sync failed with status: ${res.status}`);
                    } else {
                        const data = await res.json();
                        console.log(`[CronManager] Sync completed. Results:`, JSON.stringify(data.results));
                    }
                } catch (error: any) {
                    console.error(`[CronManager] Sync error:`, error.message);
                }
                // Re-arm — re-reads config each time so dashboard changes take effect
                this.scheduleNext();
            }, msUntil);
        });
    }

    public stop() {
        if (this.timerId) { clearTimeout(this.timerId); this.timerId = null; }
        this.isActive = false;
        console.log(`[CronManager] Sync daemon stopped.`);
    }

    /**
     * Re-arm immediately with new configuration.
     * Called by the cron API after the dashboard saves new settings.
     */
    public reschedule() {
        if (this.isActive) {
            if (this.timerId) clearTimeout(this.timerId);
            this.scheduleNext();
        }
    }

    public getStatus() {
        return {
            isActive: this.isActive,
            currentMode: this.currentMode,
            scheduledHour: this.scheduledHour,
            intervalMinutes: this.intervalMinutes,
        };
    }
}

// eslint-disable-next-line no-var
declare global { var cronManager: CronManager | undefined; }

const cronManager = global.cronManager || new CronManager();
if (process.env.NODE_ENV !== 'production') global.cronManager = cronManager;

export default cronManager;
