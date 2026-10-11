"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteTenantAction } from "@/app/(dashboard)/tenants/actions";

interface DeleteTenantButtonProps {
  tenantId: string;
  tenantName: string;
}

export function DeleteTenantButton({
  tenantId,
  tenantName,
}: DeleteTenantButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    const ok = window.confirm(
      `Delete "${tenantName}"? Their leases will also be removed. This cannot be undone.`,
    );
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteTenantAction(tenantId);
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
      aria-label={`Delete tenant ${tenantName}`}
      disabled={pending}
      onClick={handleDelete}
    >
      <Trash2Icon />
    </Button>
  );
}
