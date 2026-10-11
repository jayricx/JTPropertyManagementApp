"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaymentFormDialog } from "./payment-form-dialog";
import { deletePaymentAction } from "@/app/(dashboard)/finance/actions";
import type { PaymentFormValues } from "@/lib/validations";

interface PaymentRowActionsProps {
  leaseOptions: { id: string; label: string }[];
  payment: PaymentFormValues & { id: string };
}

export function PaymentRowActions({ leaseOptions, payment }: PaymentRowActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    const ok = window.confirm(
      `Delete this ${payment.amount} payment? This cannot be undone.`,
    );
    if (!ok) return;
    startTransition(async () => {
      const result = await deletePaymentAction(payment.id);
      if (result?.error) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <PaymentFormDialog leaseOptions={leaseOptions} payment={payment} />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Delete payment"
        disabled={pending}
        onClick={handleDelete}
      >
        <Trash2Icon />
      </Button>
    </div>
  );
}
