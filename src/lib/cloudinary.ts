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
