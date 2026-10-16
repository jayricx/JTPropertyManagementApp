"use client";

import { useActionState, useRef } from "react";
import {
  DownloadIcon,
  FileIcon,
  FileTextIcon,
  ImageIcon,
  PaperclipIcon,
  TableIcon,
  Trash2Icon,
} from "lucide-react";
import {
  deleteLeaseAttachmentAction,
  uploadLeaseAttachmentAction,
  type LeaseRecordState,
} from "@/app/(dashboard)/leases/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { attachmentKind, formatBytes } from "@/lib/attachments";
import { formatDate } from "@/lib/utils";

export interface LeaseAttachmentItem {
  id: string;
  name: string;
  type: string | null;
  sizeBytes: number | null;
  uploadedBy: string;
  createdAt: Date;
  isMine: boolean;
}

function AttachmentIcon({ type }: { type: string | null }) {
  const kind = attachmentKind(type);
  if (kind === "PDF" || kind === "Document" || kind === "Text") {
    return <FileTextIcon className="size-4" />;
  }
  if (kind === "Image") return <ImageIcon className="size-4" />;
  if (kind === "Spreadsheet") return <TableIcon className="size-4" />;
  return <FileIcon className="size-4" />;
}

/** Files hung off a lease: scans, signed copies, condition reports. */
export function LeaseAttachmentsCard({
  leaseId,
  attachments,
}: {
  leaseId: string;
  attachments: LeaseAttachmentItem[];
}) {
  const [uploadState, uploadAction, uploading] = useActionState<
    LeaseRecordState,
    FormData
  >(uploadLeaseAttachmentAction, null);
  const [, deleteAction] = useActionState<LeaseRecordState, FormData>(
    deleteLeaseAttachmentAction,
    null,
  );
  // Reset the picker after a successful upload so the same file can be
  // re-selected (the form action clears the DOM value for us).
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PaperclipIcon className="size-5" />
          Attachments
        </CardTitle>
        <CardDescription>
          Signed copies, receipts, and condition photos. PDF, images, or
          Word/Excel/text files up to 5 MB.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form ref={formRef} action={uploadAction} className="space-y-2">
          <input type="hidden" name="leaseId" value={leaseId} />
          <input
            type="file"
            name="file"
            required
            accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,.xls,.xlsx,.txt"
            aria-label="Choose a file to attach"
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
          />
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={uploading}>
              {uploading ? "Uploading…" : "Upload"}
            </Button>
            {uploadState?.error && (
              <p className="text-sm font-medium text-destructive">
                {uploadState.error}
              </p>
            )}
          </div>
        </form>

        {attachments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No files attached.</p>
        ) : (
          <ul className="space-y-2">
            {attachments.map((file) => (
              <li
                key={file.id}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                <span className="text-muted-foreground">
                  <AttachmentIcon type={file.type} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(file.sizeBytes)} · {file.uploadedBy} ·{" "}
                    {formatDate(file.createdAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Download ${file.name}`}
                  render={<a href={`/api/documents/${file.id}`} />}
                >
                  <DownloadIcon />
                </Button>
                {file.isMine && (
                  <form action={deleteAction}>
                    <input type="hidden" name="documentId" value={file.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${file.name}`}
                    >
                      <Trash2Icon />
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}