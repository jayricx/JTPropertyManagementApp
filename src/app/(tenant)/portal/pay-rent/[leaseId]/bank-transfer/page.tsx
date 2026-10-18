import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BankTransferForm } from "@/components/portal/bank-transfer-form";
import { loadPayableLease } from "@/lib/portal-lease";
import { formatCurrency } from "@/lib/utils";

/**
 * Bank-transfer rent payment: shows the landlord's bank accounts and the
 * amount to send, then collects the transaction reference from the tenant's
 * bank confirmation screen. The tenant pays in their own bank app — no
 * merchant account or gateway is involved, and the landlord verifies each
 * reference against their statement.
 */
export default async function BankTransferPayPage({
  params,
}: {
  params: Promise<{ leaseId: string }>;
}) {
  const { leaseId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const lease = await loadPayableLease(session.user.id, leaseId);
  if (!lease) redirect("/portal");
  // The landlord removed their accounts after the tenant got here — fall
  // back to the only method left rather than a dead end.
  if (lease.bankAccounts.length === 0) {
    redirect(`/portal/pay-rent/${leaseId}/gcash`);
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Pay with bank transfer
        </h1>
        <p className="text-muted-foreground">
          Send the amount from your bank app, then submit the reference number
          for verification.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payment details</CardTitle>
          <CardDescription>
            {lease.propertyName} · Unit {lease.unitName}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Amount due</dt>
              <dd className="text-lg font-semibold">
                {formatCurrency(lease.amountDue)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Method</dt>
              <dd className="text-sm font-medium">Bank transfer</dd>
            </div>
          </dl>

          <div>
            <p className="mb-2 text-sm font-medium">Accounts you can send to</p>
            <ul className="space-y-2">
              {lease.bankAccounts.map((account) => (
                <li
                  key={account.id}
                  className="rounded-lg border bg-muted/50 p-3 text-sm"
                >
                  <p className="font-medium">{account.bankName}</p>
                  <p className="text-muted-foreground">
                    {account.accountNumber} · {account.accountName}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border bg-muted/50 p-4 text-sm">
            <p className="mb-2 font-medium">How to pay</p>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>
                Open your bank app and transfer to one of the accounts above.
              </li>
              <li>
                Send{" "}
                <span className="font-semibold text-foreground">
                  {formatCurrency(lease.amountDue)}
                </span>
                .
              </li>
              <li>Copy the reference number from the confirmation screen.</li>
              <li>Submit it here — your landlord verifies it before it counts.</li>
            </ol>
          </div>

          <BankTransferForm leaseId={leaseId} accounts={lease.bankAccounts} />

          <p className="text-xs text-muted-foreground">
            Paying by GCash instead?{" "}
            <Link
              href={`/portal/pay-rent/${leaseId}`}
              className="underline underline-offset-2"
            >
              Back to all options
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
