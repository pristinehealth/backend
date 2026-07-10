import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import JobPosition from '@/models/JobPosition';
import ApplicationForm from '@/models/ApplicationForm';
import { getApplicationDocumentRequirements } from '@/lib/compliance';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        await dbConnect();
        const { id } = await params;

        const job = await JobPosition.findById(id).lean();
        if (!job) {
            return NextResponse.json({ error: 'Job position not found' }, { status: 404 });
        }

        let applicationForm = null;
        if (job.formId) {
            applicationForm = await ApplicationForm.findById(job.formId).lean();
        }

        // Required documents are resolved from the compliance catalog
        // (collectAtApplication + global/position targeting) — the single source
        // of truth. Each entry carries rich metadata so the applicant UI can
        // render custom document types without the static DOCUMENT_METADATA map.
        const documentRequirements = await getApplicationDocumentRequirements(id);

        return NextResponse.json({
            ...job,
            customFields: applicationForm ? applicationForm.customFields : [],
            requiredDocuments: documentRequirements.filter((d) => d.required).map((d) => d.documentType),
            documentRequirements,
            applicationForm,
        });
    } catch (error: any) {
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
