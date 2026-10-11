"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MaintenanceFormDialog,
  type MaintenanceUnitOption,
} from "./maintenance-form-dialog";
import { deleteMaintenanceAction } from "@/app/(dashboard)/maintenance/actions";
import type { MaintenanceFormValues } from "@/lib/validations";

interface MaintenanceRowActionsProps {
  propertyOptions: { id: string; label: string }[];
  unitOptions: MaintenanceUnitOption[];
  tenantOptions: { id: string; label: string }[];
  request: MaintenanceFormValues & { id: string };
}

export function MaintenanceRowActions({
  propertyOptions,
  unitOptions,
  tenantOptions,
  request,
}: MaintenanceRowActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    const ok = window.confirm(
      `Delete "${request.title}"? This cannot be undone.`,
    );
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteMaintenanceAction(request.id);
      if (result?.error) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <MaintenanceFormDialog
        propertyOptions={propertyOptions}
        unitOptions={unitOptions}
        tenantOptions={tenantOptions}
        request={request}
      />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Delete request ${request.title}`}
        disabled={pending}
        onClick={handleDelete}
      >
        <Trash2Icon />
      </Button>
    </div>
  );
}
