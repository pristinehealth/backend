import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import Task from '@/models/Task';
import Project from '@/models/Project';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret-please-change-in-prod';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const authHeader = req.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized: Missing or invalid token' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        let decodedToken: any;
        try {
            decodedToken = jwt.verify(token, JWT_SECRET);
        } catch {
            return NextResponse.json({ error: 'Unauthorized: Token is invalid or expired' }, { status: 401 });
        }

        const staffid = decodedToken.userid;
        if (!staffid) {
            return NextResponse.json({ error: 'Unauthorized: Token payload missing userid' }, { status: 401 });
        }

        await dbConnect();

        const task: any = await Task.findOne({ id }).lean();

        if (!task) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 });
        }

        // Verify this staff member is assigned to the task
        const isAssigned =
            (Array.isArray(task.assignees) && task.assignees.some((a: any) =>
                String(a?.assigneeid ?? a) === String(staffid)
            ));

        if (!isAssigned) {
            return NextResponse.json({ error: 'Forbidden: Task not assigned to you' }, { status: 403 });
        }

        // Hydrate project custom fields (GPS, address, etc.)
        if (task.project_data?.id) {
            const proj = await Project.findOne({ id: task.project_data.id }).select('customfields').lean();
            if (proj?.customfields) {
                task.project_data.customfields = proj.customfields;

                const addressField = proj.customfields.find((f: any) => f.label?.toLowerCase().includes('address'));
                const cityField = proj.customfields.find((f: any) => f.label?.toLowerCase().includes('city'));
                const stateField = proj.customfields.find((f: any) => f.label?.toLowerCase().includes('state') || f.label?.toLowerCase() === 'st');

                task.project_data.extracted_address = addressField?.value || '';
                task.project_data.extracted_city = cityField?.value || '';
                task.project_data.extracted_state = stateField?.value || '';
            }
        }

        return NextResponse.json({ success: true, data: task });

    } catch (error: any) {
        console.error('[Task by ID] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
