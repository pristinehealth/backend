/**
 * Singleton Cron Manager for Next.js to run our Sync API on a timer.
 * We use the global object to prevent hot-reloads in development from creating multiple timers.
 */

class CronManager {
    private timerId: NodeJS.Timeout | null = null;
    private readonly intervalMs = 5 * 60 * 1000; // 5 minutes

    // Default to true so it starts on boot unless stopped by user
    public isActive: boolean = true;

    public start() {
        if (this.timerId) {
            clearInterval(this.timerId);
        }
        this.isActive = true;

        console.log(`[CronManager] Started background sync (Interval: ${this.intervalMs}ms)`);

        // Schedule the interval
        this.timerId = setInterval(async () => {
            console.log(`[CronManager] Triggering scheduled sync...`);
            const baseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
            try {
                const res = await fetch(`${baseUrl}/api/sync/all`, { method: 'POST' });
                if (!res.ok) {
                    console.error(`[CronManager] Sync failed with status: ${res.status} hitting ${baseUrl}/api/sync/all`);
                } else {
                    const data = await res.json();
                    console.log(`[CronManager] Sync completed successfully. Results:`, JSON.stringify(data.results));
                }
            } catch (error: any) {
                console.error(`[CronManager] Sync error hitting ${baseUrl}/api/sync/all:`, error.message);
                console.error(error); // Print full trace
            }
        }, this.intervalMs);

        // Optional: Perform an immediate initial sync when started
        this.triggerImmediate();
    }

    public stop() {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
        this.isActive = false;
        console.log(`[CronManager] Stopped background sync.`);
    }

    public getStatus() {
        return { isActive: this.isActive };
    }

    private async triggerImmediate() {
        console.log(`[CronManager] Triggering immediate initial sync...`);
        const baseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
        try {
            await fetch(`${baseUrl}/api/sync/all`, { method: 'POST' });
        } catch (e: any) {
            console.error(`[CronManager] Initial sync error hitting ${baseUrl}/api/sync/all:`, e.message);
        }
    }
}

// Attach to the global object in development to prevent memory leaks from HMR
// eslint-disable-next-line no-var
declare global {
    var cronManager: CronManager | undefined;
}

const cronManager = global.cronManager || new CronManager();

if (process.env.NODE_ENV !== 'production') {
    global.cronManager = cronManager;
}

export default cronManager;
