import { CHECKIN_IMAGE_MAX_PX } from '@riad/shared';

/**
 * Resizes a camera photo to at most `maxPx` on its long side and re-encodes it as JPEG,
 * so a 5 MB phone photo becomes ~300 KB before going over a slow 4G link.
 * Falls back to the original file if the browser cannot decode it.
 */
export async function compressImage(file: File, maxPx = CHECKIN_IMAGE_MAX_PX, quality = 0.85): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }
  const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  return blob ?? file;
}
