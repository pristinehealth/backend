import { NextResponse } from 'next/server';
import { uploadBuffer } from '@/lib/cloudinary';
import dbConnect from '@/lib/mongoose';
import UploadAsset from '@/models/UploadAsset';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const source = ((formData.get('source') as string | null) || 'job_apply').trim();
        const usageType = ((formData.get('usageType') as string | null) || 'unknown').trim();
        const jobId = ((formData.get('jobId') as string | null) || '').trim();
        const fieldKey = ((formData.get('fieldKey') as string | null) || '').trim();
        const documentType = ((formData.get('documentType') as string | null) || '').trim();
        const clientSessionId = ((formData.get('clientSessionId') as string | null) || '').trim();

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        // Validate File Size (e.g., limit to 10MB)
        const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
        if (file.size > MAX_SIZE_BYTES) {
            return NextResponse.json({ error: 'File size exceeds maximum 10MB limit' }, { status: 400 });
        }

        // Validate File Extension/Mime Type (e.g., allow PDF, Word Docs, Images)
        // Admin-uploaded position images are image-only; other uploads keep the
        // broader document allow-list.
        const isPositionImage = source === 'admin' && usageType === 'position_image';
        const allowedExtensions = isPositionImage
            ? ['.png', '.jpg', '.jpeg', '.webp', '.gif']
            : ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.txt'];
        const filename = file.name.toLowerCase();
        const isValidExtension = allowedExtensions.some(ext => filename.endsWith(ext));

        if (!isValidExtension) {
            return NextResponse.json({
                error: isPositionImage
                    ? 'Invalid image type. Use PNG, JPG, WEBP, or GIF.'
                    : 'Invalid file type. Only PDF, DOC/DOCX, images, and text files are allowed.',
            }, { status: 400 });
        }

        // Convert file stream to binary Buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Position images live in their own Cloudinary folder.
        const folder = isPositionImage ? 'pristine/job-images' : 'pristine/applications';
        const uploadResult = await uploadBuffer(buffer, folder, file.name);

        // Track file so abandoned uploads can be cleaned if the application is never submitted.
        try {
            await dbConnect();
            const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
            await UploadAsset.updateOne(
                { publicId: uploadResult.public_id },
                {
                    $set: {
                        url: uploadResult.url,
                        originalFileName: file.name,
                        source: source === 'admin' ? 'admin' : 'job_apply',
                        usageType: ['supporting_document', 'custom_field', 'position_image'].includes(usageType)
                            ? usageType
                            : 'unknown',
                        jobId: jobId || null,
                        fieldKey: fieldKey || null,
                        documentType: documentType || null,
                        clientSessionId: clientSessionId || null,
                        status: 'pending',
                        uploadedAt: new Date(),
                        expiresAt,
                        consumedAt: null,
                        deletedAt: null,
                    },
                },
                { upsert: true }
            );
        } catch (trackingError) {
            console.error('[Upload Route] Failed to track pending upload:', trackingError);
        }

        return NextResponse.json({
            message: 'File uploaded successfully',
            url: uploadResult.url,
            public_id: uploadResult.public_id
        }, { status: 200 });

    } catch (error: any) {
        console.error('[Upload Route] Error processing upload:', error);
        return NextResponse.json({ 
            error: 'Internal Server Error during upload processing', 
            details: error.message 
        }, { status: 500 });
    }
}
