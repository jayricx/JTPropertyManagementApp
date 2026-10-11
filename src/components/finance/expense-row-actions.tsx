"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExpenseFormDialog, type ExpenseUnitOption } from "./expense-form-dialog";
import { deleteExpenseAction } from "@/app/(dashboard)/finance/actions";
import type { ExpenseFormValues } from "@/lib/validations";

interface ExpenseRowActionsProps {
  propertyOptions: { id: string; label: string }[];
  unitOptions: ExpenseUnitOption[];
  expense: ExpenseFormValues & { id: string };
}

export function ExpenseRowActions({
  propertyOptions,
  unitOptions,
  expense,
}: ExpenseRowActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    const ok = window.confirm(
      `Delete this ${expense.amount} expense? This cannot be undone.`,
    );
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteExpenseAction(expense.id);
      if (result?.error) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <ExpenseFormDialog
        propertyOptions={propertyOptions}
        unitOptions={unitOptions}
        expense={expense}
      />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Delete expense"
        disabled={pending}
        onClick={handleDelete}
      >
        <Trash2Icon />
      </Button>
    </div>
  );
}
