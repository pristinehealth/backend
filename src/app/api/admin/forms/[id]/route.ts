import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import ApplicationForm from '@/models/ApplicationForm';
import JobPosition from '@/models/JobPosition';
import { getDefaultApplicationDocuments, DOCUMENT_METADATA } from '@/lib/documentMetadata';
import type { DocumentType } from '@/models/ApplicationDocument';

async function isAdmin() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return false;
    const role = (session.user as any).role;
    return role === 'admin' || role === 'superadmin';
}

function normalizeRequiredDocuments(input: unknown): DocumentType[] {
    const allowed = new Set(Object.keys(DOCUMENT_METADATA) as DocumentType[]);
    if (!Array.isArray(input)) {
        return getDefaultApplicationDocuments();
    }

    const next = input
        .filter((doc): doc is DocumentType => typeof doc === 'string' && allowed.has(doc as DocumentType));

    return Array.from(new Set(next));
}

type DocumentRequirement = {
    documentType: DocumentType;
    required: boolean;
};

function getDefaultDocumentRequirements(): DocumentRequirement[] {
    return getDefaultApplicationDocuments().map((documentType) => ({
        documentType,
        required: !!DOCUMENT_METADATA[documentType]?.mandatory,
    }));
}

function normalizeDocumentRequirements(input: unknown, legacyRequiredDocuments: unknown): DocumentRequirement[] {
    const allowed = new Set(Object.keys(DOCUMENT_METADATA) as DocumentType[]);

    if (Array.isArray(input)) {
        const normalized = input
            .map((item) => {
                if (!item || typeof item !== 'object') return null;
                const rawType = (item as { documentType?: unknown }).documentType;
                const rawRequired = (item as { required?: unknown }).required;
                if (typeof rawType !== 'string' || !allowed.has(rawType as DocumentType)) return null;
                return {
                    documentType: rawType as DocumentType,
                    required: !!rawRequired,
                };
            })
            .filter((item): item is DocumentRequirement => !!item);

        const unique = new Map<string, DocumentRequirement>();
        normalized.forEach((item) => unique.set(item.documentType, item));
        if (unique.size > 0) return Array.from(unique.values());
    }

    const legacy = normalizeRequiredDocuments(legacyRequiredDocuments);
    if (legacy.length > 0) {
        return legacy.map((documentType) => ({ documentType, required: true }));
    }

    return getDefaultDocumentRequirements();
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    let idStr = "";
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }
        await dbConnect();
        const { id } = await params;
        idStr = id;
        const form = await ApplicationForm.findById(id);
        if (!form) {
            return NextResponse.json({ success: false, error: 'Form not found' }, { status: 404 });
        }
        return NextResponse.json({ success: true, data: form });
    } catch (error: any) {
        console.error(`GET /api/admin/forms/${idStr || 'unknown'} error:`, error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    let idStr = "";
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }
        await dbConnect();
        const { id } = await params;
        idStr = id;
        const body = await request.json();

        const form = await ApplicationForm.findById(id);
        if (!form) {
            return NextResponse.json({ success: false, error: 'Form not found' }, { status: 404 });
        }

        if (body.name && body.name !== form.name) {
            const existing = await ApplicationForm.findOne({ name: body.name });
            if (existing) {
                return NextResponse.json({ success: false, error: 'Form name already exists' }, { status: 400 });
            }
            form.name = body.name;
        }

        if (body.customFields !== undefined) {
            form.customFields = body.customFields;
        }

        if (body.requiredDocuments !== undefined || body.documentRequirements !== undefined) {
            const normalizedRequirements = normalizeDocumentRequirements(body.documentRequirements, body.requiredDocuments);
            form.requiredDocuments = normalizedRequirements.filter((doc) => doc.required).map((doc) => doc.documentType);
            (form as any).documentRequirements = normalizedRequirements;
        }

        await form.save();
        return NextResponse.json({ success: true, data: form });
    } catch (error: any) {
        console.error(`PUT /api/admin/forms/${idStr || 'unknown'} error:`, error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    let idStr = "";
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }
        await dbConnect();
        const { id } = await params;
        idStr = id;

        // Check if any JobPosition is using this form
        const isUsed = await JobPosition.findOne({ formId: id });
        if (isUsed) {
            return NextResponse.json({
                success: false,
                error: 'Cannot delete form because it is linked to one or more job positions.'
            }, { status: 400 });
        }

        const deleted = await ApplicationForm.findByIdAndDelete(id);
        if (!deleted) {
            return NextResponse.json({ success: false, error: 'Form not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, message: 'Form deleted successfully' });
    } catch (error: any) {
        console.error(`DELETE /api/admin/forms/${idStr || 'unknown'} error:`, error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
