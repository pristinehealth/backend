import { NextResponse } from 'next/server';
import { uploadBuffer } from '@/lib/cloudinary';
import dbConnect from '@/lib/mongoose';
import UploadAsset from '@/models/UploadAsset';
import { rateLimit, clientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        // Rate limit anonymous uploads (public endpoint). Generous enough for a
        // single application's several document/field uploads, but caps floods.
        const ip = clientIp(request);
        const burst = rateLimit(`upload:min:${ip}`, 20, 60_000);
        const hourly = rateLimit(`upload:hr:${ip}`, 80, 60 * 60_000);
        if (!burst.ok || !hourly.ok) {
            const retryAfter = Math.max(burst.retryAfter, hourly.retryAfter);
            console.warn('[Upload Route] rate limited', { ip, retryAfter });
            return NextResponse.json(
                { error: 'Too many uploads — please wait a moment and try again.' },
                { status: 429, headers: { 'Retry-After': String(retryAfter) } }
            );
        }

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

        // Position images live in their own Cloudinary folder and stay public
        // (shown directly on careers pages). Applicant files can be stored as
        // 'authenticated' (raw URL not publicly reachable) once every surface
        // that views them goes through a signing proxy — gated by an env flag so
        // it defaults to today's public behavior and can be switched on safely.
        // Admin uploads (source 'admin') stay public and get their URL back;
        // everything else is an applicant upload (job_apply, job_track_edit, …).
        const isAdminUpload = source === 'admin';
        const privateApplicantFiles = process.env.CLOUDINARY_PRIVATE_APPLICANT_FILES === 'true';
        const folder = isPositionImage ? 'pristine/job-images' : 'pristine/applications';
        const deliveryType = (!isAdminUpload && privateApplicantFiles) ? 'authenticated' : 'upload';
        const uploadResult = await uploadBuffer(buffer, folder, file.name, deliveryType);

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

        // Applicant uploads get back only a publicId — never the raw storage URL
        // (the server resolves it at submit time). Admin uploads still receive
        // the URL, since they are shown directly and are not applicant-private.
        return NextResponse.json({
            message: 'File uploaded successfully',
            public_id: uploadResult.public_id,
            ...(isAdminUpload ? { url: uploadResult.url } : {}),
        }, { status: 200 });

    } catch (error: any) {
        console.error('[Upload Route] Error processing upload:', error);
        return NextResponse.json({ 
            error: 'Internal Server Error during upload processing', 
            details: error.message 
        }, { status: 500 });
    }
}
