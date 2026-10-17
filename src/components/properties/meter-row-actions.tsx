"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MeterFormDialog } from "./meter-form-dialog";
import { deleteMeterAction } from "@/app/(dashboard)/properties/utility-actions";
import type { MeterType } from "@/lib/validations";

interface MeterRowActionsProps {
  propertyId: string;
  unitOptions: { id: string; label: string }[];
  meter: {
    id: string;
    unitId: string;
    type: MeterType;
    label: string | null;
    rate: number;
    hasReadings: boolean;
  };
}

export function MeterRowActions({
  propertyId,
  unitOptions,
  meter,
}: MeterRowActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    const ok = window.confirm(
      "Delete this meter? This cannot be undone.",
    );
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteMeterAction(meter.id);
      if (result?.error) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <MeterFormDialog
        propertyId={propertyId}
        unitOptions={unitOptions}
        meter={meter}
        trigger="icon"
      />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Delete meter"
        disabled={pending || meter.hasReadings}
        title={
          meter.hasReadings
            ? "This meter has readings on file — keep it so past bills stay intact."
            : undefined
        }
        onClick={handleDelete}
      >
        <Trash2Icon />
      </Button>
    </div>
  );
}
