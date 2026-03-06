import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import ServiceReport from '@/models/ServiceReport';
import Staff from '@/models/Staff';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        await dbConnect();

        const { searchParams } = new URL(request.url);
        const taskId = searchParams.get('taskId');

        let query = {};
        if (taskId) {
            query = { task_id: taskId };
        }

        const reports = await ServiceReport.find(query).sort({ time_taken: -1 }).lean();

        // Hydrate with staff names
        const enrichedReports = await Promise.all(reports.map(async (report: any) => {
            if (report.staff_id) {
                const staff = await Staff.findOne({ staffid: report.staff_id }).lean();
                if (staff) {
                    report.staff_name = `${staff.firstname} ${staff.lastname}`.trim();
                } else {
                    report.staff_name = `Staff #${report.staff_id}`;
                }
            }
            return report;
        }));

        return NextResponse.json({ success: true, data: enrichedReports });

    } catch (error: any) {
        console.error('Error fetching service reports:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch service reports' },
            { status: 500 }
        );
    }
}
