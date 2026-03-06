import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import Settings from '@/models/Settings';

/** GET /api/settings — returns all settings as { key: value } map */
export async function GET() {
    try {
        await dbConnect();
        const docs = await Settings.find({});
        const map: Record<string, string> = {};
        for (const doc of docs) map[doc.key] = doc.value;
        return NextResponse.json({ success: true, settings: map });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

/** POST /api/settings — upsert one or more settings { key: value, ... } */
export async function POST(req: Request) {
    try {
        await dbConnect();
        const body = await req.json();
        const updates: Promise<any>[] = [];

        for (const [key, value] of Object.entries(body)) {
            if (typeof value !== 'string' && typeof value !== 'number') continue;
            updates.push(
                Settings.findOneAndUpdate(
                    { key },
                    { $set: { value: String(value) } },
                    { upsert: true, new: true }
                )
            );
        }

        await Promise.all(updates);
        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
