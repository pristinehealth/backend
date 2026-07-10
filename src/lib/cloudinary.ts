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

export const uploadBuffer = async (buffer: Buffer, folder: string = 'resumes', originalFilename?: string): Promise<{ url: string; public_id: string; provider: string }> => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: folder,
                resource_type: 'auto', // Automatically detect PDF, Image, Raw document
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

    for (const resourceType of resourceTypes) {
        try {
            const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
            if (result.result === 'ok' || result.result === 'not found') {
                return true;
            }
        } catch {
            // Try the next resource type.
        }
    }

    return false;
};

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

