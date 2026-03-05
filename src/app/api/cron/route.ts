import { NextResponse } from 'next/server';
import cronManager from '@/lib/cronManager';

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
        } else {
            return NextResponse.json({ error: 'Invalid action. Use start or stop.' }, { status: 400 });
        }

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
