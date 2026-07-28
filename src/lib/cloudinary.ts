import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary using the CLOUDINARY_URL environment variable
// which is automatically picked up if present.
cloudinary.config({
    secure: true,
});

export const uploadBase64Image = async (base64String: string, folder: string = 'signatures') => {
    try {
        // The Cloudinary Node SDK natively supports data URI upload strings
        const result = await cloudinary.uploader.upload(base64String, {
            folder: folder,
            resource_type: 'image',
        });

        return {
            url: result.secure_url,
            public_id: result.public_id,
            provider: 'cloudinary'
        };
    } catch (error) {
        console.error("Cloudinary upload error:", error);
        throw new Error("Failed to upload image to Cloudinary");
    }
};

export const uploadBuffer = async (
    buffer: Buffer,
    folder: string = 'resumes',
    originalFilename?: string,
    // 'authenticated' assets are not publicly reachable by URL — they require a
    // signed URL (generated server-side) to deliver. Use it for applicant files;
    // 'upload' (public) is for assets meant to be shown directly (e.g. images).
    deliveryType: 'upload' | 'authenticated' = 'upload'
): Promise<{ url: string; public_id: string; provider: string }> => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: folder,
                resource_type: 'auto', // Automatically detect PDF, Image, Raw document
                type: deliveryType,
                public_id: originalFilename ? originalFilename.replace(/[^a-zA-Z0-9]/g, '_') + '_' + Date.now() : undefined
            },
            (error, result) => {
                if (error || !result) {
                    console.error("Cloudinary buffer upload error:", error);
                    reject(new Error("Failed to upload file to Cloudinary"));
                } else {
                    resolve({
                        url: result.secure_url,
                        public_id: result.public_id,
                        provider: 'cloudinary'
                    });
                }
            }
        );
        stream.end(buffer);
    });
};

export const deleteAssetByPublicId = async (publicId: string): Promise<boolean> => {
    const resourceTypes: Array<'image' | 'video' | 'raw'> = ['image', 'raw', 'video'];
    // Applicant files are 'authenticated'; legacy/public assets are 'upload'.
    const deliveryTypes: Array<'upload' | 'authenticated' | 'private'> = ['upload', 'authenticated', 'private'];

    let seenNotFound = false;
    for (const resourceType of resourceTypes) {
        for (const type of deliveryTypes) {
            try {
                const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type });
                if (result.result === 'ok') return true;
                if (result.result === 'not found') seenNotFound = true;
            } catch {
                // Try the next combination.
            }
        }
    }

    // Nothing was deleted, but if Cloudinary reported "not found" the asset is
    // already gone — treat that as success (matches prior behavior).
    return seenNotFound;
};

interface ParsedCloudinaryUrl {
    resourceType: 'image' | 'raw' | 'video';
    deliveryType: 'upload' | 'authenticated' | 'private';
    publicId: string;   // includes extension for raw; excludes it for image/video
    format?: string;    // set for image/video
}

/**
 * Parse a stored Cloudinary secure_url into the pieces needed to re-sign it.
 * URL shape: /<cloud>/<resource_type>/<delivery_type>/[s--sig--/][v<ver>/]<path>.<ext>
 */
export function parseCloudinaryUrl(url: string): ParsedCloudinaryUrl | null {
    try {
        const u = new URL(url);
        if (!u.hostname.includes('cloudinary')) return null;
        const parts = u.pathname.split('/').filter(Boolean); // [cloud, rt, dt, ...rest]
        if (parts.length < 4) return null;

        const resourceType = parts[1] as ParsedCloudinaryUrl['resourceType'];
        const deliveryType = parts[2] as ParsedCloudinaryUrl['deliveryType'];
        let rest = parts.slice(3);
        if (rest[0] && /^s--[\w-]+--$/.test(rest[0])) rest = rest.slice(1); // signature
        if (rest[0] && /^v\d+$/.test(rest[0])) rest = rest.slice(1);        // version
        if (!rest.length) return null;

        const path = rest.join('/');
        if (resourceType === 'raw') {
            return { resourceType, deliveryType, publicId: path };
        }
        const dot = path.lastIndexOf('.');
        return dot === -1
            ? { resourceType, deliveryType, publicId: path }
            : { resourceType, deliveryType, publicId: path.slice(0, dot), format: path.slice(dot + 1) };
    } catch {
        return null;
    }
}

/**
 * Turn a stored secure_url into a URL the server can actually fetch:
 *  - public ('upload') assets are already fetchable — returned unchanged.
 *  - 'authenticated'/'private' assets get a freshly signed delivery URL, so the
 *    proxy can stream them even though the raw path is not publicly reachable.
 * Returns the input unchanged when it can't parse (safe fallback).
 */
export function signedFetchUrl(storedUrl: string): string {
    const parsed = parseCloudinaryUrl(storedUrl);
    if (!parsed || parsed.deliveryType === 'upload') return storedUrl;

    // Cloudinary refuses a plain signed *delivery* URL for an authenticated (or
    // private) PDF — it returns HTTP 401 "deny or ACL failure" because PDF
    // delivery is restricted at the delivery endpoint. Authenticated images and
    // raw files are NOT restricted and deliver fine, so only PDFs need special
    // handling. The download API is exempt and returns the original bytes —
    // exactly what our streaming proxy wants. (Verified against Cloudinary: an
    // authenticated JPG and an authenticated raw file both return 200 via the
    // delivery URL, while an authenticated PDF returns 401 via the delivery URL
    // and 200 via private_download_url.)
    if (parsed.resourceType === 'image' && parsed.format === 'pdf') {
        return cloudinary.utils.private_download_url(parsed.publicId, parsed.format, {
            resource_type: parsed.resourceType,
            type: parsed.deliveryType,
        });
    }

    return cloudinary.url(parsed.publicId, {
        resource_type: parsed.resourceType,
        type: parsed.deliveryType,
        sign_url: true,
        secure: true,
        ...(parsed.format ? { format: parsed.format } : {}),
    });
}

/**
 * Derive a Cloudinary public_id from a stored secure_url, e.g.
 * https://res.cloudinary.com/<cloud>/image/upload/v123/pristine/applications/file.pdf
 * -> pristine/applications/file
 */
export function publicIdFromUrl(url: string): string | null {
    try {
        const u = new URL(url);
        if (!u.hostname.includes('cloudinary')) return null;
        const parts = u.pathname.split('/').filter(Boolean);
        const idx = parts.findIndex((p) => p === 'upload' || p === 'authenticated' || p === 'private');
        if (idx === -1) return null;
        let rest = parts.slice(idx + 1);
        if (rest[0] && /^v\d+$/.test(rest[0])) rest = rest.slice(1); // drop version segment
        if (!rest.length) return null;
        rest[rest.length - 1] = rest[rest.length - 1].replace(/\.[^.]+$/, ''); // drop extension
        return rest.join('/');
    } catch {
        return null;
    }
}

/** Securely delete a Cloudinary asset given its stored URL. */
export const deleteAssetByUrl = async (url: string): Promise<boolean> => {
    const publicId = publicIdFromUrl(url);
    if (!publicId) return false;
    return deleteAssetByPublicId(publicId);
};

