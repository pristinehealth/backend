import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import Task from '@/models/Task';
import Timesheet from '@/models/Timesheet';
import Staff from '@/models/Staff';
import Project from '@/models/Project';
import Customer from '@/models/Customer';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        await dbConnect();
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseInt(searchParams.get('limit') || '50', 10);
        const staffSearch = (searchParams.get('staff') || '').trim();
        // Single date prefix match (e.g. "2026-03-06" from custom picker)
        const dateFilter = (searchParams.get('date') || '').trim();
        // Date range (from day chips: Today / This Week)
        const dateFrom = (searchParams.get('dateFrom') || '').trim();
        const dateTo = (searchParams.get('dateTo') || '').trim();
        const skip = (page - 1) * limit;

        // --- Server-side staff filter ---
        // Step 1: Resolve matching staff IDs by name (case-insensitive regex)
        let taskIdFilter: string[] | null = null;
        if (staffSearch) {
            const nameRegex = new RegExp(staffSearch, 'i');
            const matchingStaff = await Staff.find({
                $or: [
                    { firstname: nameRegex },
                    { lastname: nameRegex },
                    // Also match "firstname lastname" as a combined search
                ]
            }).lean() as any[];

            // Also try matching full name concatenated
            const fullNameMatches = await Staff.find({}).lean() as any[];
            const fullMatchIds = fullNameMatches
                .filter((s: any) => `${s.firstname} ${s.lastname}`.toLowerCase().includes(staffSearch.toLowerCase()))
                .map((s: any) => String(s.staffid));

            const staffIds = Array.from(new Set([
                ...matchingStaff.map((s: any) => String(s.staffid)),
                ...fullMatchIds
            ]));

            if (staffIds.length === 0) {
                // No staff matched — return empty result immediately
                return NextResponse.json({
                    data: [],
                    pagination: { total: 0, page, limit, totalPages: 0 }
                });
            }

            // Step 2: Get all task IDs associated with those staff via timesheets
            const timesheets = await Timesheet.find({ staff_id: { $in: staffIds } }).lean() as any[];
            const matchedTaskIds = Array.from(new Set(timesheets.map((ts: any) => String(ts.task_id))));

            if (matchedTaskIds.length === 0) {
                return NextResponse.json({
                    data: [],
                    pagination: { total: 0, page, limit, totalPages: 0 }
                });
            }

            taskIdFilter = matchedTaskIds;
        }

        // Step 3: Build the MongoDB query combining staff + date filters
        // IMPORTANT: include both string and numeric forms since Perfex stores IDs
        // as integers in 'tasks' but timesheets may reference them as strings.
        const conditions: any[] = [];

        if (taskIdFilter) {
            const numericIds = taskIdFilter.map(id => parseInt(id, 10)).filter(n => !isNaN(n));
            conditions.push({
                $or: [
                    { id: { $in: taskIdFilter } },
                    { id: { $in: numericIds } },
                ]
            });
        }

        if (dateFilter) {
            // Single date from custom picker: prefix match "YYYY-MM-DD"
            conditions.push({
                $or: [
                    { startdate: { $regex: `^${dateFilter}` } },
                    { dateadded: { $regex: `^${dateFilter}` } },
                ]
            });
        } else if (dateFrom) {
            // Range query from Today / This Week chips
            // startdate stored as "YYYY-MM-DD HH:MM:SS" — string comparison works for ISO dates
            const dateToExclusive = dateTo
                ? (() => { const d = new Date(dateTo); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; })()
                : undefined;
            const rangeCondition: any = { startdate: { $gte: dateFrom } };
            if (dateToExclusive) rangeCondition.startdate.$lt = dateToExclusive;
            conditions.push(rangeCondition);
        }

        const query: any = conditions.length === 1 ? conditions[0]
            : conditions.length > 1 ? { $and: conditions }
                : {};

        const total = await Task.countDocuments(query);
        const rawTasks = await Task.find(query)
            .sort({ dateadded: -1, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        // Hydrate Tasks with Timesheet History & Staff Names
        const tasks = await Promise.all(rawTasks.map(async (task: any) => {
            const timesheets = await Timesheet.find({ task_id: task.id }).lean();

            const enrichedTimesheets = await Promise.all(timesheets.map(async (ts: any) => {
                const staff = await Staff.findOne({ staffid: ts.staff_id }).lean() as any;
                return {
                    ...ts,
                    staff_name: staff ? `${staff.firstname} ${staff.lastname}`.trim() : `Staff #${ts.staff_id}`
                };
            }));
            enrichedTimesheets.sort((a, b) => Number(b.start_time) - Number(a.start_time));

            const assignedStaff: string[] = Array.from(
                new Set(enrichedTimesheets.map((ts: any) => ts.staff_name).filter(Boolean))
            );

            let client_name: string | null = null;
            const projectId = task.project_data?.id || task.rel_id;
            if (projectId) {
                const project = await Project.findOne({ id: String(projectId) }).lean() as any;
                if (project?.clientid) {
                    const customer = await Customer.findOne({ userid: String(project.clientid) }).lean() as any;
                    if (customer?.company) client_name = customer.company;
                }
            }

            const shiftTimes = enrichedTimesheets
                .filter((ts: any) => ts.start_time && Number(ts.start_time) > 0);
            const firstShiftStart = shiftTimes.length > 0
                ? new Date(Number(shiftTimes[shiftTimes.length - 1].start_time) * 1000).toISOString()
                : null;
            const lastShiftEnd = shiftTimes.length > 0 && shiftTimes[0].end_time && Number(shiftTimes[0].end_time) > 0
                ? new Date(Number(shiftTimes[0].end_time) * 1000).toISOString()
                : null;

            return { ...task, timesheets: enrichedTimesheets, assignedStaff, client_name, firstShiftStart, lastShiftEnd };
        }));

        return NextResponse.json({
            data: tasks,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error: any) {
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
