import UploadAsset from '@/models/UploadAsset';
import { isFileProxyRef } from '@/lib/applicationFiles';

/**
 * Resolve a client-supplied file reference to the real stored (Cloudinary) URL.
 *
 * A reference is one of:
 *  - an http(s) URL — already a URL (legacy clients / pre-existing data); kept as-is.
 *  - a storage `publicId` — a freshly uploaded file; looked up in UploadAsset.
 *  - a same-origin proxy ref — an unchanged existing file (track-edit); resolves
 *    to '' here because callers handle "keep existing" separately before this.
 *
 * Returns '' when it cannot resolve to a URL. This is the boundary that lets the
 * client stop holding Cloudinary URLs while remaining backward compatible with
 * any caller still sending a raw URL.
 */
export async function resolveFileReference(ref: unknown): Promise<string> {
    if (typeof ref !== 'string' || !ref.trim()) return '';
    const value = ref.trim();
    if (/^https?:\/\//i.test(value)) return value;
    if (isFileProxyRef(value)) return '';
    const asset = await UploadAsset.findOne({ publicId: value }).select('url').lean();
    return asset?.url || '';
}
