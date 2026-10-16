"use client";

import { useRef, useState, useTransition } from "react";
import type { FormEvent } from "react";
import {
  FileVideoIcon,
  ImageIcon,
  PaperclipIcon,
  Trash2Icon,
  WrenchIcon,
} from "lucide-react";
import { createTenantRequestAction } from "@/app/(tenant)/portal/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  formatBytes,
  MAX_MEDIA_FILE_BYTES,
  MAX_MEDIA_FILES,
} from "@/lib/attachments";
import { prepareMediaFiles } from "@/lib/media-client";
import {
  maintenancePriorities,
  maintenancePriorityLabels,
} from "@/lib/validations";

interface PickedFile {
  file: File;
  /** Object URL for the thumbnail; revoked when the picker changes. */
  previewUrl: string | null;
}

export function TenantRequestForm() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [picked, setPicked] = useState<PickedFile[]>([]);
  const [preparing, setPreparing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function clearPicked(next: PickedFile[]) {
    for (const p of picked) if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
    setPicked(next);
  }

  async function onFilesChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = [...(event.target.files ?? [])];
    // Let the same file be picked again after a failed submit.
    event.target.value = "";
    if (!chosen.length) return;
    setError(null);
    setNote(null);

    const room = MAX_MEDIA_FILES - picked.length;
    if (chosen.length > room) {
      setError(`You can attach up to ${MAX_MEDIA_FILES} files per report.`);
      return;
    }

    setPreparing(true);
    const { prepared, notes } = await prepareMediaFiles(chosen);
    setPreparing(false);

    const tooBig = prepared.find((f) => f.size > MAX_MEDIA_FILE_BYTES);
    if (tooBig) {
      setError(
        `“${tooBig.name}” is ${formatBytes(tooBig.size)} — the limit is ${formatBytes(MAX_MEDIA_FILE_BYTES)} per file.`,
      );
      return;
    }

    const additions: PickedFile[] = prepared.map((file) => ({
      file,
      previewUrl: file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : null,
    }));
    clearPicked([...picked, ...additions]);
    if (notes.length) setNote(notes.join(" "));
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNote(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("title", title);
      formData.set("description", description);
      formData.set("priority", priority);
      for (const p of picked) formData.append("files", p.file);
      const result = await createTenantRequestAction(null, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      // The portal revalidates — clear the form for the next report.
      setTitle("");
      setDescription("");
      clearPicked([]);
    });
  }

  const busy = pending || preparing;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <label
            htmlFor="request-title"
            className="text-sm font-medium leading-none"
          >
            What&apos;s the problem?
          </label>
          <Input
            id="request-title"
            placeholder="e.g. Leaking kitchen faucet"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={255}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <label
            htmlFor="request-description"
            className="text-sm font-medium leading-none"
          >
            Details{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Textarea
            id="request-description"
            placeholder="Describe where it is and when it happens…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={5000}
          />
        </div>

        {/* Photos / short video ------------------------------------------ */}
        <div className="space-y-2 sm:col-span-2">
          <label htmlFor="request-media" className="text-sm font-medium leading-none">
            Photos or video{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy || picked.length >= MAX_MEDIA_FILES}
            >
              <PaperclipIcon />
              Add {picked.length > 0 ? "another" : "photo"}
            </Button>
            <span className="text-xs text-muted-foreground">
              Up to {MAX_MEDIA_FILES} files, {formatBytes(MAX_MEDIA_FILE_BYTES)} each. Large photos
              are shrunk automatically.
            </span>
          </div>
          <input
            ref={fileInputRef}
            id="request-media"
            type="file"
            accept="image/*,video/mp4,video/quicktime,video/webm"
            multiple
            className="hidden"
            onChange={onFilesChosen}
          />
          {preparing && (
            <p className="text-xs text-muted-foreground">Preparing photos…</p>
          )}
          {note && <p className="text-xs text-muted-foreground">{note}</p>}
          {picked.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {picked.map((p, index) => (
                <li
                  key={`${p.file.name}-${index}`}
                  className="relative flex items-center gap-2 rounded-lg border p-1.5 pr-8"
                >
                  {p.previewUrl ? (
                    // Blob URL from the picked file — next/image can't
                    // optimise one.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.previewUrl}
                      alt=""
                      className="size-12 rounded object-cover"
                    />
                  ) : (
                    <span className="grid size-12 place-items-center rounded bg-muted">
                      <FileVideoIcon className="size-5" />
                    </span>
                  )}
                  <span className="text-xs">
                    <span className="block max-w-32 truncate">{p.file.name}</span>
                    <span className="text-muted-foreground">
                      {formatBytes(p.file.size)}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${p.file.name}`}
                    onClick={() =>
                      clearPicked(picked.filter((_, i) => i !== index))
                    }
                    className="absolute top-1 right-1 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium leading-none">Priority</label>
          <Select
            items={maintenancePriorities.map((p) => ({
              value: p,
              label: maintenancePriorityLabels[p],
            }))}
            value={priority}
            onValueChange={(v) => setPriority(v ?? "medium")}
          >
            <SelectTrigger className="w-full" aria-label="Priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {maintenancePriorities.map((p) => (
                <SelectItem key={p} value={p}>
                  {maintenancePriorityLabels[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={busy} className="w-full sm:w-auto">
            <WrenchIcon />
            {pending ? "Sending…" : "Report issue"}
          </Button>
        </div>
      </div>
      {busy && picked.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ImageIcon className="size-3.5" />
          Uploading your files with the report…
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}