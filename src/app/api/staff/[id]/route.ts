import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import Staff from '@/models/Staff';
import JobApplication from '@/models/JobApplication';
import JobPosition from '@/models/JobPosition';
import ApplicationForm from '@/models/ApplicationForm';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    await dbConnect();

    // Fetch single staff from local database instead of Perfex
    const staff = await Staff.findOne({ staffid: id }).lean();

    if (!staff) {
      return NextResponse.json({ error: `Staff with ID ${id} not found in local DB.` }, { status: 404 });
    }

    // Admins see any profile; staff may only view their own record.
    const isAdmin = session.user.role === 'admin' || session.user.role === 'superadmin';
    if (!isAdmin && staff.email !== session.user.email) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let customfields = Array.isArray(staff.customfields) ? staff.customfields : [];

    if (staff.email) {
      const latestApplication = await JobApplication.findOne({
        applicantEmail: { $regex: new RegExp(`^${staff.email.trim()}$`, 'i') },
      })
        .sort({ createdAt: -1 })
        .lean();

      if (latestApplication) {
        const job = await JobPosition.findById(latestApplication.jobId).select('formId').lean();
        const form = job?.formId
          ? await ApplicationForm.findById(job.formId).select('customFields').lean()
          : null;

        const formFields = Array.isArray(form?.customFields) ? form.customFields : [];
        const cfv: any = latestApplication.customFieldValues;
        const submittedFields = formFields
          .map((field: any) => {
            const rawValue = cfv instanceof Map ? cfv.get(field.name) : cfv?.[field.name];
            if (rawValue === undefined || rawValue === null || rawValue === '') {
              return null;
            }

            return {
              label: field.label || field.name,
              value: Array.isArray(rawValue) ? rawValue.join(', ') : String(rawValue),
            };
          })
          .filter(Boolean);

        if (submittedFields.length > 0) {
          customfields = submittedFields;
        }
      }
    }

    return NextResponse.json({
      ...staff,
      customfields,
    });
  } catch (error: any) {
    console.error('Error fetching staff from local DB:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
