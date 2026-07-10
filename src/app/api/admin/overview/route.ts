import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import Staff from '@/models/Staff';
import Customer from '@/models/Customer';
import Task from '@/models/Task';
import Project from '@/models/Project';
import Timesheet from '@/models/Timesheet';
import { getComplianceSummary } from '@/lib/compliance';

export const dynamic = 'force-dynamic';

async function isAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return false;
  const role = session.user.role;
  return role === 'admin' || role === 'superadmin';
}

/**
 * GET /api/admin/overview
 * One lean call for the dashboard overview — counts computed server-side with
 * countDocuments (no shipping full lists to the client), plus the compliance
 * summary and a few upcoming tasks.
 */
export async function GET() {
  try {
    if (!(await isAdmin())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await dbConnect();
    const todayStr = new Date().toISOString().slice(0, 10);

    const [
      totalStaff,
      verifiedStaff,
      totalCustomers,
      activeCustomers,
      totalTasks,
      closedTasks,
      overdueTasks,
      totalProjects,
      finishedProjects,
      totalTimesheets,
      upcomingRaw,
      compliance,
    ] = await Promise.all([
      Staff.countDocuments({}),
      Staff.countDocuments({ passwordHash: { $nin: [null, ''] }, emailVerified: true }),
      Customer.countDocuments({}),
      Customer.countDocuments({ active: '1' }),
      Task.countDocuments({}),
      Task.countDocuments({ status: '5' }),
      // Overdue: not closed and a real due date strictly before today.
      Task.countDocuments({ status: { $ne: '5' }, duedate: { $gt: '0001', $lt: todayStr } }),
      Project.countDocuments({}),
      Project.countDocuments({ status: '5' }),
      Timesheet.estimatedDocumentCount(),
      Task.find({ status: { $ne: '5' }, duedate: { $gt: '0001' } })
        .sort({ duedate: 1 })
        .limit(6)
        .lean(),
      getComplianceSummary(),
    ]);

    const upcoming = (upcomingRaw as any[]).map((t) => ({
      id: t.id ?? String(t._id),
      name: t.name || '',
      status: t.status ?? null,
      duedate: t.duedate || null,
      assignedStaff: Array.isArray(t.assignedStaff) ? t.assignedStaff : [],
    }));

    console.log('[Overview] served', {
      staff: totalStaff,
      customers: totalCustomers,
      tasks: totalTasks,
      overdue: overdueTasks,
      compliance: { attention: compliance.attention, mandatoryMissing: compliance.mandatoryMissing },
    });
    return NextResponse.json({
      success: true,
      staff: { total: totalStaff, verified: verifiedStaff },
      customers: { total: totalCustomers, active: activeCustomers },
      tasks: { total: totalTasks, closed: closedTasks, overdue: overdueTasks },
      projects: { total: totalProjects, finished: finishedProjects },
      timesheets: { total: totalTimesheets },
      upcoming,
      compliance,
    });
  } catch (err: any) {
    console.error('[Overview] Error:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Failed to load overview' }, { status: 500 });
  }
}
