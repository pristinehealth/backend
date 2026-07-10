import UploadAsset from '@/models/UploadAsset';
import { deleteAssetByPublicId, deleteAssetByUrl, publicIdFromUrl } from '@/lib/cloudinary';

/**
 * Asset-lifecycle helpers for a JobPosition's optional hero image.
 *
 * Uploaded images land as a `pending` UploadAsset (48h TTL, subject to abandoned-
 * upload cleanup). These helpers keep the Cloudinary asset and its UploadAsset
 * record in sync with the position:
 *  - `markImageConsumed`  — call when a position is saved with an image, so the
 *                           asset is protected from abandoned-upload deletion.
 *  - `discardPositionImage` — call when an image is replaced/removed or the
 *                           position is deleted, to free the Cloudinary asset.
 */

/** Protect a saved position image from abandoned-upload cleanup. No-op if absent. */
export async function markImageConsumed(publicId?: string | null): Promise<void> {
  if (!publicId) return;
  try {
    await UploadAsset.updateOne(
      { publicId },
      { $set: { status: 'consumed', consumedAt: new Date(), usageType: 'position_image' } }
    );
  } catch (err: any) {
    console.error('[Position Image] failed to mark asset consumed:', err?.message || err);
  }
}

/** Delete a position image from Cloudinary and mark its UploadAsset deleted. */
export async function discardPositionImage(imageUrl?: string | null, imagePublicId?: string | null): Promise<void> {
  const publicId = imagePublicId || (imageUrl ? publicIdFromUrl(imageUrl) : null);
  if (!publicId && !imageUrl) return;
  try {
    if (publicId) await deleteAssetByPublicId(publicId);
    else if (imageUrl) await deleteAssetByUrl(imageUrl);
  } catch (err: any) {
    console.error('[Position Image] Cloudinary delete failed:', err?.message || err);
  }
  if (publicId) {
    try {
      await UploadAsset.updateOne({ publicId }, { $set: { status: 'deleted', deletedAt: new Date() } });
    } catch (err: any) {
      console.error('[Position Image] failed to mark asset deleted:', err?.message || err);
    }
  }
}
