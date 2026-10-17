"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteChargeAction } from "@/app/(dashboard)/leases/actions";

export function DeleteChargeButton({
  chargeId,
  leaseId,
}: {
  chargeId: string;
  leaseId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!window.confirm("Delete this charge?")) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("chargeId", chargeId);
      formData.set("leaseId", leaseId);
      const result = await deleteChargeAction(null, formData);
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
      aria-label="Delete charge"
      disabled={pending}
      onClick={handleDelete}
    >
      <Trash2Icon />
    </Button>
  );
}
