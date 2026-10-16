/**
 * Lease attachments. Files are held in Postgres as base64 until object
 * storage credentials exist — Vercel's filesystem is read-only, so writing
 * to `public/` at runtime would silently vanish on redeploy.
 */

/** Request-body room for a multipart upload (Next counts the whole body). */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/**
 * Allowlist, not a blocklist. HTML and SVG are deliberately excluded: they
 * can carry script, and attachments are user-supplied.
 */
export const ALLOWED_ATTACHMENT_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/png": "Image",
  "image/jpeg": "Image",
  "image/webp": "Image",
  "image/heic": "Image",
  "application/msword": "Document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "Document",
  "application/vnd.ms-excel": "Spreadsheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    "Spreadsheet",
  "text/plain": "Text",
};

export type AttachmentKind = (typeof ALLOWED_ATTACHMENT_TYPES)[string];

/** Images can be served inline (thumbnails); everything else downloads. */
export const INLINE_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

/**
 * Photos and short video clips a tenant attaches to a reported issue.
 *
 * The combined budget is deliberately small: Vercel's serverless runtime
 * caps a request body at ~4.5MB, so the whole multipart body has to fit
 * under that. Photos are re-encoded client-side before upload (see
 * `src/lib/media-client.ts`), which keeps three phone photos near 1MB and
 * leaves room for one short clip.
 */
export const MAX_MEDIA_FILES = 3;
export const MAX_MEDIA_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_MEDIA_TOTAL_BYTES = 4 * 1024 * 1024;

export const ALLOWED_MEDIA_TYPES: Record<string, AttachmentKind> = {
  ...ALLOWED_ATTACHMENT_TYPES,
  "video/mp4": "Video",
  "video/quicktime": "Video",
  "video/webm": "Video",
};

/** Validate one picked file against the media rules. */
export function validateMediaFile(
  file: File,
): { ok: true } | { ok: false; error: string } {
  const name = sanitizeFileName(file.name);
  if (!(file.type in ALLOWED_MEDIA_TYPES)) {
    return {
      ok: false,
      error: `“${name}” isn't a supported photo or video.`,
    };
  }
  if (file.size > MAX_MEDIA_FILE_BYTES) {
    return {
      ok: false,
      error: `“${name}” is ${formatBytes(file.size)} — the limit is 4 MB per file.`,
    };
  }
  return { ok: true };
}

/** Validate the whole selection (count + combined size). */
export function validateMediaSelection(files: File[]):
  | { ok: true }
  | { ok: false; error: string } {
  if (files.length > MAX_MEDIA_FILES) {
    return {
      ok: false,
      error: `Attach up to ${MAX_MEDIA_FILES} files per report.`,
    };
  }
  const total = files.reduce((sum, f) => sum + f.size, 0);
  if (total > MAX_MEDIA_TOTAL_BYTES) {
    return {
      ok: false,
      error: `Those files add up to ${formatBytes(total)} — the limit is 4 MB in total.`,
    };
  }
  return { ok: true };
}

/** Shape a browser-supplied filename for display and download headers. */
export function sanitizeFileName(name: string): string {
  const base = name
    .replace(/[\\/]/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const cleaned = base.slice(0, 200);
  return cleaned || "attachment";
}

export function validateAttachment(
  file: File,
): { ok: true } | { ok: false; error: string } {
  if (file.size === 0) return { ok: false, error: "That file is empty." };
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return {
      ok: false,
      error: `"${sanitizeFileName(file.name)}" is larger than 5 MB.`,
    };
  }
  if (!(file.type in ALLOWED_ATTACHMENT_TYPES)) {
    return {
      ok: false,
      error: `Files of type "${file.type || "unknown"}" can't be attached. Use PDF, an image, or a Word/Excel/text document.`,
    };
  }
  return { ok: true };
}

export function attachmentKind(type: string | null): AttachmentKind {
  return (type && ALLOWED_ATTACHMENT_TYPES[type]) || "File";
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}