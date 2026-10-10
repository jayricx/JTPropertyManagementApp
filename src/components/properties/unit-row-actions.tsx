"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UnitFormDialog } from "./unit-form-dialog";
import { deleteUnitAction } from "@/app/(dashboard)/properties/actions";
import type { UnitFormValues } from "@/lib/validations";

interface UnitRowActionsProps {
  propertyId: string;
  unit: UnitFormValues & { id: string };
}

export function UnitRowActions({ propertyId, unit }: UnitRowActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    const ok = window.confirm(
      `Delete unit "${unit.name}"? This cannot be undone.`,
    );
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteUnitAction(unit.id);
      if (result?.error) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <UnitFormDialog propertyId={propertyId} unit={unit} />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Delete unit ${unit.name}`}
        disabled={pending}
        onClick={handleDelete}
      >
        <Trash2Icon />
      </Button>
    </div>
  );
}
