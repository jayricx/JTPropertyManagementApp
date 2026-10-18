"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LandmarkIcon, PlusIcon, Trash2Icon } from "lucide-react";
import {
  createBankAccountAction,
  deleteBankAccountAction,
  type ActionState,
} from "@/app/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OTHER_BANK_CODE, PHILIPPINE_BANKS } from "@/lib/banks";
import {
  bankAccountSchema,
  type BankAccountFormParsed,
  type BankAccountFormValues,
} from "@/lib/validations";

export interface BankAccountRow {
  id: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
}

/**
 * Landlord-side manager for the bank accounts tenants see on the
 * bank-transfer pay-rent page: add one (dropdown of major PH banks, or
 * "Other" to type the name) and remove ones they no longer want to offer.
 */
export function BankAccountsManager({ accounts }: { accounts: BankAccountRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const defaults: BankAccountFormValues = {
    bankCode: "",
    otherBankName: "",
    accountNumber: "",
    accountName: "",
  };

  const form = useForm<BankAccountFormValues, unknown, BankAccountFormParsed>({
    resolver: zodResolver(bankAccountSchema),
    defaultValues: defaults,
  });
  const bankCode = useWatch({ control: form.control, name: "bankCode" });

  function onSubmit(values: BankAccountFormParsed) {
    const formData = new FormData();
    Object.entries(values).forEach(([key, value]) => {
      formData.set(key, value == null ? "" : String(value));
    });

    setError(null);
    startTransition(async () => {
      const result = await createBankAccountAction(null, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      // Success — close, reset, and refresh the settings list.
      setOpen(false);
      form.reset(defaults);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No bank accounts yet — tenants can only pay by GCash until you add
          one.
        </p>
      ) : (
        <ul className="space-y-2">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium">
                  <LandmarkIcon className="size-4 shrink-0 text-muted-foreground" />
                  {account.bankName}
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  {account.accountNumber} · {account.accountName}
                </p>
              </div>
              <DeleteBankAccountButton id={account.id} />
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setError(null);
        }}
      >
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          <PlusIcon />
          Add bank account
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a bank account</DialogTitle>
            <DialogDescription>
              Tenants paying by bank transfer will see these details — add the
              account you want the money to land in.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-4"
              noValidate
            >
              <FormField
                control={form.control}
                name="bankCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bank</FormLabel>
                    <Select
                      items={[
                        ...PHILIPPINE_BANKS.map((b) => ({
                          value: b.code,
                          label: b.name,
                        })),
                        { value: OTHER_BANK_CODE, label: "Other (type the name)" },
                      ]}
                      value={field.value}
                      onValueChange={(v) => field.onChange(v)}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Choose a bank" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PHILIPPINE_BANKS.map((b) => (
                          <SelectItem key={b.code} value={b.code}>
                            {b.name}
                          </SelectItem>
                        ))}
                        <SelectItem value={OTHER_BANK_CODE}>
                          Other (type the name)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {bankCode === OTHER_BANK_CODE && (
                <FormField
                  control={form.control}
                  name="otherBankName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bank name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Rural Bank of San Pedro" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="accountNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account number</FormLabel>
                      <FormControl>
                        <Input
                          inputMode="numeric"
                          placeholder="1234 5678 9012"
                          autoComplete="off"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="accountName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Juan Dela Cruz"
                          autoComplete="off"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              {error && (
                <p className="text-sm font-medium text-destructive">{error}</p>
              )}
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>
                  Cancel
                </DialogClose>
                <Button type="submit" disabled={pending}>
                  {pending ? "Adding..." : "Add account"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Row-level remove button with its own action state. */
function DeleteBankAccountButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    deleteBankAccountAction,
    null,
  );

  return (
    <form action={formAction} className="shrink-0">
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pending}
        aria-label="Remove bank account"
        title={state?.error ?? "Remove bank account"}
      >
        <Trash2Icon />
      </Button>
    </form>
  );
}
