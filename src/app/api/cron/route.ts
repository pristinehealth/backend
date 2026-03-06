import { NextResponse } from 'next/server';
import cronManager from '@/lib/cronManager';
import dbConnect from '@/lib/mongoose';
import Settings from '@/models/Settings';

export async function GET() {
    return NextResponse.json(cronManager.getStatus());
}

export async function POST(request: Request) {
    try {
        const body = await request.json();

        if (body.action === 'start') {
            cronManager.start();
            return NextResponse.json({ success: true, message: 'Cron started', ...cronManager.getStatus() });

        } else if (body.action === 'stop') {
            cronManager.stop();
            return NextResponse.json({ success: true, message: 'Cron stopped', ...cronManager.getStatus() });

        } else if (body.action === 'reschedule') {
            const { mode, hour, intervalMinutes } = body;

            if (!['daily', 'interval'].includes(mode)) {
                return NextResponse.json({ error: "mode must be 'daily' or 'interval'" }, { status: 400 });
            }
            if (mode === 'daily') {
                const h = parseInt(hour, 10);
                if (isNaN(h) || h < 0 || h > 23)
                    return NextResponse.json({ error: 'hour must be 0–23' }, { status: 400 });
            }
            if (mode === 'interval') {
                const m = parseInt(intervalMinutes, 10);
                if (isNaN(m) || m < 1)
                    return NextResponse.json({ error: 'intervalMinutes must be ≥ 1' }, { status: 400 });
            }

            await dbConnect();

            // Always save the mode
            await Settings.findOneAndUpdate(
                { key: 'sync_mode' },
                { $set: { value: mode } },
                { upsert: true }
            );

            if (mode === 'daily') {
                // Save daily hour, remove interval setting so it can't bleed back in
                await Promise.all([
                    Settings.findOneAndUpdate({ key: 'sync_hour' }, { $set: { value: String(hour) } }, { upsert: true }),
                    Settings.deleteOne({ key: 'sync_interval_minutes' }),
                ]);
            } else {
                // Save interval minutes, remove daily hour setting
                await Promise.all([
                    Settings.findOneAndUpdate({ key: 'sync_interval_minutes' }, { $set: { value: String(intervalMinutes) } }, { upsert: true }),
                    Settings.deleteOne({ key: 'sync_hour' }),
                ]);
            }

            cronManager.reschedule(); // re-reads from DB
            return NextResponse.json({ success: true, ...cronManager.getStatus() });

        } else {
            return NextResponse.json({ error: "Invalid action. Use 'start', 'stop', or 'reschedule'." }, { status: 400 });
        }

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
