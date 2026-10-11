"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteLeaseAction } from "@/app/(dashboard)/leases/actions";

interface DeleteLeaseButtonProps {
  leaseId: string;
  /** e.g. "Juan Dela Cruz — Apt 1A" */
  leaseLabel: string;
}

export function DeleteLeaseButton({ leaseId, leaseLabel }: DeleteLeaseButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    const ok = window.confirm(
      `Delete the lease for "${leaseLabel}"? The unit will be marked vacant if no other active lease remains. This cannot be undone.`,
    );
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteLeaseAction(leaseId);
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
      aria-label={`Delete lease for ${leaseLabel}`}
      disabled={pending}
      onClick={handleDelete}
    >
      <Trash2Icon />
    </Button>
  );
}
