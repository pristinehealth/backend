import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongoose';
import ApplicationForm from '@/models/ApplicationForm';
import { getDefaultApplicationDocuments, DOCUMENT_METADATA } from '@/lib/documentMetadata';
import type { DocumentType } from '@/models/ApplicationDocument';

export const dynamic = 'force-dynamic';

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

async function isAdmin() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return false;
    const role = (session.user as any).role;
    return role === 'admin' || role === 'superadmin';
}

export async function GET() {
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const forms = await ApplicationForm.find({}).sort({ createdAt: -1 }).lean();
        return NextResponse.json({ data: forms });
    } catch (error: any) {
        console.error("GET /api/admin/forms error:", error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const body = await request.json();
        const { name, customFields, requiredDocuments, documentRequirements } = body;

        if (!name) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 });
        }

        if (!customFields || !Array.isArray(customFields)) {
            return NextResponse.json({ error: 'customFields array is required' }, { status: 400 });
        }

        const normalizedRequirements = normalizeDocumentRequirements(documentRequirements, requiredDocuments);

        const newForm = await ApplicationForm.create({
            name,
            customFields,
            requiredDocuments: normalizedRequirements.filter((doc) => doc.required).map((doc) => doc.documentType),
            documentRequirements: normalizedRequirements,
        });

        return NextResponse.json({ message: 'Application form created successfully', data: newForm }, { status: 201 });
    } catch (error: any) {
        console.error("POST /api/admin/forms error:", error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
