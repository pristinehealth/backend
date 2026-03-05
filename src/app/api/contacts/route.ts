import { NextResponse } from 'next/server';

export async function GET() {
    // For now, Contacts logic isn't fully defined via sync logic. 
    // Returning empty array gracefully.
    return NextResponse.json([]);
}
