import { FileVideoIcon, PaperclipIcon } from "lucide-react";
import { INLINE_IMAGE_TYPES } from "@/lib/attachments";

export interface RequestMediaItem {
  id: string;
  name: string;
  type: string | null;
  sizeBytes: number | null;
}

function formatSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Photos and video clips attached to a maintenance report. Images render
 * inline as thumbnails (the documents route allows that for image types
 * only); videos open in a new tab and download.
 */
export function RequestMediaStrip({
  items,
  size = "sm",
}: {
  items: RequestMediaItem[];
  size?: "sm" | "xs";
}) {
  if (!items.length) return null;
  const thumb = size === "sm" ? "size-14" : "size-10";

  return (
    <ul className="mt-2 flex flex-wrap items-center gap-2">
      {items.map((item) => {
        const isImage = INLINE_IMAGE_TYPES.has(item.type ?? "");
        const href = `/api/documents/${item.id}`;
        return (
          <li key={item.id}>
            <a
              href={href}
              {...(isImage ? {} : { download: true })}
              target="_blank"
              rel="noreferrer"
              title={`${item.name}${formatSize(item.sizeBytes) ? ` · ${formatSize(item.sizeBytes)}` : ""}`}
              className="flex items-center gap-2 rounded-md border p-1 transition-colors hover:bg-muted"
            >
              {isImage ? (
                // Already-small images served by our own route; next/image
                // cannot optimise an API response without extra config.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={href}
                  alt={item.name}
                  className={`${thumb} rounded object-cover`}
                />
              ) : (
                <span
                  className={`${thumb} flex items-center justify-center gap-1 rounded bg-muted text-muted-foreground`}
                >
                  <FileVideoIcon className="size-4" />
                  <span className="sr-only">Video</span>
                </span>
              )}
            </a>
          </li>
        );
      })}
      {items.length > 1 && (
        <li className="flex items-center gap-1 text-xs text-muted-foreground">
          <PaperclipIcon className="size-3.5" />
          {items.length}
        </li>
      )}
    </ul>
  );
}