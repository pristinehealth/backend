import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import Staff from '@/models/Staff';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await dbConnect();

    // Fetch single staff from local database instead of Perfex
    const staff = await Staff.findOne({ staffid: id }).lean();

    if (!staff) {
      return NextResponse.json({ error: `Staff with ID ${id} not found in local DB.` }, { status: 404 });
    }

    return NextResponse.json(staff);
  } catch (error: any) {
    console.error('Error fetching staff from local DB:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
