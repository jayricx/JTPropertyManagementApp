"use client";

import { useState } from "react";
import { ImageIcon, XIcon } from "lucide-react";
import { prepareMediaFile } from "@/lib/media-client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatBytes } from "@/lib/attachments";

const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;

/**
 * Optional proof-of-payment photo for a rent submission.
 *
 * The photo is re-encoded in the browser (a phone screenshot is often too big
 * to post otherwise), previewed so the tenant can see they attached the right
 * screenshot, and removable. Optional on purpose: the reference number is what
 * the landlord actually verifies, so nobody should be blocked from paying
 * because a camera wouldn't open.
 */
export function ReceiptPhotoInput({
  onChange,
  busy,
  label = "Photo of the receipt (optional)",
  hint = "A screenshot of the confirmation screen helps your landlord verify it faster.",
}: {
  onChange: (file: File | null) => void;
  busy: boolean;
  label?: string;
  hint?: string;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  async function handlePick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Allow re-picking the same file after a removal.
    event.target.value = "";
    if (!file) return;

    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Attach a photo, not another kind of file.");
      return;
    }

    setPreparing(true);
    try {
      const { file: prepared, resized } = await prepareMediaFile(file);
      if (prepared.size > MAX_RECEIPT_BYTES) {
        setError(
          `That photo is ${formatBytes(prepared.size)} — the limit is 4 MB.`,
        );
        return;
      }
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(prepared);
      });
      setName(resized ? `${file.name.replace(/\.[^.]+$/, "")}.jpg` : file.name);
      onChange(prepared);
    } catch {
      setError("That photo couldn't be read. Try another one.");
    } finally {
      setPreparing(false);
    }
  }

  function clear() {
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    setName(null);
    setError(null);
    onChange(null);
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="receipt-photo">{label}</Label>
      {preview ? (
        <div className="flex items-start gap-3 rounded-lg border p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- object URL preview, not a static asset */}
          <img
            src={preview}
            alt="Receipt preview"
            className="size-20 rounded object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="text-xs text-muted-foreground">
              Attached. Your landlord sees it beside the reference.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clear}
            disabled={busy}
            aria-label="Remove receipt photo"
          >
            <XIcon />
          </Button>
        </div>
      ) : (
        <label
          htmlFor="receipt-photo"
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-3 text-sm hover:bg-muted/50"
        >
          <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">
            {preparing ? "Preparing the photo…" : "Choose or take a photo"}
          </span>
          <input
            id="receipt-photo"
            type="file"
            name="receipt"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={handlePick}
            disabled={busy || preparing}
          />
        </label>
      )}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}