/**
 * Client-side media preparation (browser only).
 *
 * A modern phone photo is 3–5MB, and a serverless request body caps out
 * around 4.5MB — so a tenant attaching two photos would blow the limit
 * before the app even sees it. Re-encoding in the browser fixes that: long
 * edge capped at 1600px, JPEG quality 0.82, which turns a 4MB photo into
 * roughly 300KB with no visible loss at thumbnail size.
 *
 * Anything that can't be decoded (HEIC from iPhones, which browsers often
 * can't rasterise) is passed through untouched and left to the server-side
 * validator.
 */

const MAX_IMAGE_EDGE = 1600;
const JPEG_QUALITY = 0.82;

export interface PreparedMedia {
  file: File;
  /** Set when the original was re-encoded. */
  resized: boolean;
  /** True when the original was already small enough to send as-is. */
  skippedReason?: string;
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      return null;
    }
  }
  // Fallback for browsers without createImageBitmap.
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

function bitmapSize(bitmap: ImageBitmap | HTMLImageElement): { w: number; h: number } {
  if ("width" in bitmap && typeof bitmap.width === "number") {
    return { w: bitmap.width, h: bitmap.height };
  }
  return {
    w: (bitmap as HTMLImageElement).naturalWidth,
    h: (bitmap as HTMLImageElement).naturalHeight,
  };
}

/** Re-encode one image if it is worth doing; pass videos through. */
export async function prepareMediaFile(file: File): Promise<PreparedMedia> {
  const isImage = file.type.startsWith("image/");
  if (!isImage) return { file, resized: false, skippedReason: "not-an-image" };

  // Small enough already? Don't burn CPU re-encoding it.
  if (file.size <= 400 * 1024) {
    return { file, resized: false, skippedReason: "already-small" };
  }

  const bitmap = await loadBitmap(file);
  if (!bitmap) return { file, resized: false, skippedReason: "not-decodable" };

  const { w, h } = bitmapSize(bitmap);
  if (!w || !h) return { file, resized: false, skippedReason: "not-decodable" };

  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(w, h));
  const targetW = Math.round(w * scale);
  const targetH = Math.round(h * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { file, resized: false, skippedReason: "no-canvas" };
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, targetW, targetH);
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob || blob.size >= file.size) {
    return { file, resized: false, skippedReason: "re-encode-not-smaller" };
  }

  const base = file.name.replace(/\.[^.]+$/, "");
  return {
    file: new File([blob], `${base}.jpg`, { type: "image/jpeg" }),
    resized: true,
  };
}

/** Prepare a whole selection, keeping total size in check. */
export async function prepareMediaFiles(
  files: File[],
): Promise<{ prepared: File[]; notes: string[] }> {
  const prepared: File[] = [];
  const notes: string[] = [];
  for (const file of files) {
    const result = await prepareMediaFile(file);
    if (result.resized) {
      notes.push(`${file.name} was shrunk to fit the upload limit.`);
    }
    prepared.push(result.file);
  }
  return { prepared, notes };
}