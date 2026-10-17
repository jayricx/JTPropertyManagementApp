"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteReadingAction } from "@/app/(dashboard)/properties/utility-actions";

export function DeleteReadingButton({
  readingId,
  label,
}: {
  readingId: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!window.confirm(`Delete the ${label} reading?`)) return;
    startTransition(async () => {
      const result = await deleteReadingAction(readingId);
      if (result?.error) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Delete ${label} reading`}
      disabled={pending}
      onClick={handleDelete}
    >
      <Trash2Icon />
    </Button>
  );
}
