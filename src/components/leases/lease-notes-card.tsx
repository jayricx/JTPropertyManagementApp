"use client";

import { useActionState } from "react";
import { MessageSquarePlusIcon, Trash2Icon } from "lucide-react";
import {
  addLeaseNoteAction,
  deleteLeaseNoteAction,
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
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";

export interface LeaseNoteItem {
  id: string;
  body: string;
  authorName: string;
  createdAt: Date;
  /** Only the author may delete their note. */
  isMine: boolean;
}

/** Free-text notes on a lease: renewal dates, agreements, phone calls. */
export function LeaseNotesCard({
  leaseId,
  notes,
}: {
  leaseId: string;
  notes: LeaseNoteItem[];
}) {
  const [addState, addAction, adding] = useActionState<LeaseRecordState, FormData>(
    addLeaseNoteAction,
    null,
  );
  const [, deleteAction] = useActionState<LeaseRecordState, FormData>(
    deleteLeaseNoteAction,
    null,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquarePlusIcon className="size-5" />
          Notes
        </CardTitle>
        <CardDescription>
          Anything worth remembering about this lease — renewal talks, agreed
          repairs, contact details.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form action={addAction} className="space-y-2">
          <input type="hidden" name="leaseId" value={leaseId} />
          <Textarea
            name="body"
            rows={3}
            maxLength={2000}
            required
            placeholder="Add a note…"
            aria-label="New note"
            className="resize-y"
          />
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={adding}>
              {adding ? "Adding…" : "Add note"}
            </Button>
            {addState?.error && (
              <p className="text-sm font-medium text-destructive">
                {addState.error}
              </p>
            )}
          </div>
        </form>

        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        ) : (
          <ul className="space-y-3">
            {notes.map((note) => (
              <li key={note.id} className="rounded-lg border p-3">
                <p className="text-sm whitespace-pre-wrap">{note.body}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {note.authorName} · {formatDate(note.createdAt)}
                  </p>
                  {note.isMine && (
                    <form action={deleteAction}>
                      <input type="hidden" name="noteId" value={note.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete note"
                      >
                        <Trash2Icon />
                      </Button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}