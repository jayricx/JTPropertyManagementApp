"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deletePropertyAction } from "@/app/(dashboard)/properties/actions";

interface DeletePropertyButtonProps {
  propertyId: string;
  propertyName: string;
}

export function DeletePropertyButton({
  propertyId,
  propertyName,
}: DeletePropertyButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    const ok = window.confirm(
      `Delete "${propertyName}"? Its units will also be removed. This cannot be undone.`,
    );
    if (!ok) return;
    startTransition(async () => {
      const result = await deletePropertyAction(propertyId);
      if (result?.error) {
        window.alert(result.error);
        return;
      }
      router.push("/properties");
      router.refresh();
    });
  }

  return (
    <Button
      variant="destructive"
      size="sm"
      disabled={pending}
      onClick={handleDelete}
    >
      <Trash2Icon />
      {pending ? "Deleting…" : "Delete"}
    </Button>
  );
}
