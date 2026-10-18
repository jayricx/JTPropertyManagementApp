import { asc, desc, eq, inArray, or } from "drizzle-orm";
import { Coins, PaperclipIcon, Receipt, Wallet } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { expenses, leases, payments, properties, tenants, units } from "@/db/schema";
import { StatCard } from "@/components/dashboard/stat-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExpenseFormDialog } from "@/components/finance/expense-form-dialog";
import { ExpenseRowActions } from "@/components/finance/expense-row-actions";
import { PaymentFormDialog } from "@/components/finance/payment-form-dialog";
import { PaymentReviewActions } from "@/components/finance/payment-review-actions";
import { PaymentRowActions } from "@/components/finance/payment-row-actions";
import { PropertyFilter } from "@/components/filters/property-filter";
import {
  accessiblePropertyIds,
  listAccessibleProperties,
  manageablePropertyIds,
} from "@/lib/access";
import {
  normalizePropertyFilter,
  sanitizePropertySelection,
} from "@/lib/property-filter";
import { paymentReceipts } from "@/lib/rent-payment";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  expenseCategoryLabels,
  paymentMethodLabels,
  paymentTypeLabels,
  type ExpenseFormValues,
  type PaymentFormValues,
} from "@/lib/validations";

/** Format a stored date as the "YYYY-MM-DD" value `<input type="date">` wants. */
function toInputDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

interface FinancePageProps {
  searchParams: Promise<{ properties?: string }>;
}

export default async function FinancePage({ searchParams }: FinancePageProps) {
  const { properties: propertiesRaw } = await searchParams;
  const session = await auth();
  const userId = session?.user?.id;
  // The dashboard layout redirects unauthenticated visitors.
  if (!userId) return null;

  // Owned properties plus shared ones: the page shows everything the user
  // can access, while record buttons/options only cover what they manage
  // (viewers get a read-only view — their own records stay editable).
  const [accessibleIds, manageableIds] = await Promise.all([
    accessiblePropertyIds(userId),
    manageablePropertyIds(userId),
  ]);
  const canManageAny = manageableIds.length > 0;
  const manageableSet = new Set(manageableIds);

  const [allPayments, allExpenses, leaseRows, propertyRows, unitRows, filterOptions] =
    await Promise.all([
      db
        .select({
          id: payments.id,
          userId: payments.userId,
          leaseId: payments.leaseId,
          propertyId: properties.id,
          amount: payments.amount,
          paidDate: payments.paidDate,
          method: payments.method,
          type: payments.type,
          status: payments.status,
          notes: payments.notes,
          tenantFirst: tenants.firstName,
          tenantLast: tenants.lastName,
          unitName: units.name,
          propertyName: properties.name,
        })
        .from(payments)
        .leftJoin(leases, eq(payments.leaseId, leases.id))
        .leftJoin(tenants, eq(leases.tenantId, tenants.id))
        .leftJoin(units, eq(leases.unitId, units.id))
        .leftJoin(properties, eq(units.propertyId, properties.id))
        .where(
          or(
            eq(payments.userId, userId),
            inArray(properties.id, accessibleIds),
          ),
        )
        .orderBy(desc(payments.paidDate), desc(payments.createdAt)),
      db
        .select({
          id: expenses.id,
          userId: expenses.userId,
          propertyId: expenses.propertyId,
          unitId: expenses.unitId,
          category: expenses.category,
          amount: expenses.amount,
          expenseDate: expenses.expenseDate,
          vendor: expenses.vendor,
          notes: expenses.notes,
          propertyName: properties.name,
          unitName: units.name,
        })
        .from(expenses)
        .leftJoin(properties, eq(expenses.propertyId, properties.id))
        .leftJoin(units, eq(expenses.unitId, units.id))
        .where(
          or(
            eq(expenses.userId, userId),
            inArray(expenses.propertyId, accessibleIds),
          ),
        )
        .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt)),
      // Dialog dropdowns only offer properties the user can actually book
      // records to — viewers shouldn't pick the shared read-only property.
      db
        .select({
          id: leases.id,
          tenantFirst: tenants.firstName,
          tenantLast: tenants.lastName,
          unitName: units.name,
          propertyName: properties.name,
        })
        .from(leases)
        .innerJoin(tenants, eq(leases.tenantId, tenants.id))
        .innerJoin(units, eq(leases.unitId, units.id))
        .innerJoin(properties, eq(units.propertyId, properties.id))
        .where(inArray(properties.id, manageableIds))
        .orderBy(asc(properties.name), asc(units.name)),
      db
        .select({ id: properties.id, name: properties.name })
        .from(properties)
        .where(inArray(properties.id, manageableIds))
        .orderBy(asc(properties.name)),
      db
        .select({ id: units.id, propertyId: units.propertyId, name: units.name })
        .from(units)
        .innerJoin(properties, eq(units.propertyId, properties.id))
        .where(inArray(properties.id, manageableIds))
        .orderBy(asc(properties.name), asc(units.name)),
      // Filter options cover everything the user can reach (owned +
      // co-owned) — filtering is a view, not an edit scope, so the dialog
      // dropdowns below keep their own manageable-only lists.
      listAccessibleProperties(userId),
    ]);

  // Property filter (`?properties=`, shared with the Reports filter).
  // `null` = no filter; `[]` = "deselect all", which shows an empty ledger.
  const propertyFilter = sanitizePropertySelection(
    normalizePropertyFilter(propertiesRaw),
    filterOptions.map((o) => o.id),
  );
  const isFiltered = propertyFilter !== null;
  const selection = isFiltered ? new Set(propertyFilter) : null;
  // Records booked to no property ("Not linked"/unassigned) belong to no
  // property, so they drop out whenever a filter is active.
  const inFilter = (propertyId: string | null) =>
    !selection || (propertyId !== null && selection.has(propertyId));
  // Tenant GCash submissions awaiting approval live in their own queue and
  // stay out of the ledger (totals, P&L, per-property splits) until verified;
  // rejected submissions never show — they count nowhere.
  const pendingRows = allPayments.filter(
    (p) => p.status === "pending" && inFilter(p.propertyId),
  );
  const paymentRows = allPayments.filter(
    (p) => p.status === "paid" && inFilter(p.propertyId),
  );
  const expenseRows = allExpenses.filter((e) => inFilter(e.propertyId));

  const totalIncome = paymentRows.reduce((s, p) => s + Number(p.amount), 0);
  const totalExpenses = expenseRows.reduce((s, e) => s + Number(e.amount), 0);
  const net = totalIncome - totalExpenses;

  // Per-property P&L: payments flow in through their lease's unit; payments
  // without a lease are grouped under "Unassigned".
  const pnlByProperty = new Map<
    string,
    { label: string; income: number; expense: number }
  >();
  const pnlEntry = (key: string, label: string) => {
    let entry = pnlByProperty.get(key);
    if (!entry) {
      entry = { label, income: 0, expense: 0 };
      pnlByProperty.set(key, entry);
    }
    return entry;
  };
  for (const p of paymentRows) {
    pnlEntry(p.propertyId ?? "unassigned", p.propertyName ?? "Unassigned")
      .income += Number(p.amount);
  }
  for (const e of expenseRows) {
    pnlEntry(e.propertyId ?? "unassigned", e.propertyName ?? "Unassigned")
      .expense += Number(e.amount);
  }
  const pnlRows = [...pnlByProperty.entries()]
    .map(([key, r]) => ({ key, ...r, net: r.income - r.expense }))
    .sort((a, b) => b.net - a.net);

  const leaseOptions = leaseRows.map((l) => ({
    id: l.id,
    label: `${l.tenantFirst} ${l.tenantLast} — ${l.unitName} (${l.propertyName})`,
  }));
  const propertyOptions = propertyRows.map((p) => ({ id: p.id, label: p.name }));
  const unitOptions = unitRows.map((u) => ({
    id: u.id,
    propertyId: u.propertyId,
    label: u.name,
  }));

  const toPaymentValues = (
    p: (typeof paymentRows)[number],
  ): PaymentFormValues & { id: string } => ({
    id: p.id,
    leaseId: p.leaseId ?? "",
    amount: Number(p.amount),
    paidDate: toInputDate(p.paidDate),
    method: p.method,
    type: p.type,
    notes: p.notes ?? "",
  });

  const toExpenseValues = (
    e: (typeof expenseRows)[number],
  ): ExpenseFormValues & { id: string } => ({
    id: e.id,
    propertyId: e.propertyId ?? "",
    unitId: e.unitId ?? "",
    category: e.category,
    amount: Number(e.amount),
    expenseDate: toInputDate(e.expenseDate),
    vendor: e.vendor ?? "",
    notes: e.notes ?? "",
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Finance</h1>
          <p className="text-muted-foreground">
            Record income and expenses, and view your portfolio&apos;s cash flow.
          </p>
        </div>
        <PropertyFilter
          options={filterOptions}
          selected={propertyFilter}
          ariaLabel="Filter finance by properties"
          noneLabel="No properties selected"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={Wallet}
          label="Total income"
          value={formatCurrency(totalIncome)}
          sub={`${paymentRows.length} payment${paymentRows.length === 1 ? "" : "s"} recorded`}
          tone="gold"
        />
        <StatCard
          icon={Receipt}
          label="Total expenses"
          value={formatCurrency(totalExpenses)}
          sub={`${expenseRows.length} expense${expenseRows.length === 1 ? "" : "s"} recorded`}
          tone="rose"
        />
        <StatCard
          icon={Coins}
          label="Net balance"
          value={formatCurrency(net)}
          sub="Income minus expenses"
          tone="teal"
        />
      </div>

      {pendingRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Awaiting verification</CardTitle>
            <CardDescription>
              GCash and bank-transfer payments submitted by tenants. Check each
              reference against your own app history — the receipt photo, when
              one was attached, is right here — and verify it. Until then it is
              not counted as income and doesn&apos;t reduce the tenant&apos;s
              balance.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingRows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{formatDate(p.paidDate)}</TableCell>
                    <TableCell>
                      <div>
                        {p.tenantFirst} {p.tenantLast}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.unitName} · {p.propertyName}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.notes ?? "—"}
                      <ReceiptLinks paymentId={p.id} />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(p.amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.propertyId != null &&
                      manageableSet.has(p.propertyId) ? (
                        <PaymentReviewActions
                          paymentId={p.id}
                          amountLabel={formatCurrency(p.amount)}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Awaiting owner
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Income</CardTitle>
            <CardDescription>
              Rent and other payments received from tenants.
            </CardDescription>
          </div>
          {canManageAny && <PaymentFormDialog leaseOptions={leaseOptions} />}
        </CardHeader>
        <CardContent>
          {paymentRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {isFiltered
                ? "No payments recorded for the selected properties."
                : "No income recorded yet. Use “Add payment” to log rent you’ve received."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Lease</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  {canManageAny && (
                    <TableHead className="text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentRows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{formatDate(p.paidDate)}</TableCell>
                    <TableCell>
                      {p.leaseId ? (
                        <div>
                          <div>
                            {p.tenantFirst} {p.tenantLast}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {p.unitName} · {p.propertyName}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">
                          Not linked
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{paymentTypeLabels[p.type]}</TableCell>
                    <TableCell>
                      {paymentMethodLabels[p.method]}
                      {/* GCash portal payments carry their reference number —
                          the landlord matches it against their GCash history. */}
                      {p.notes && (
                        <div className="text-xs text-muted-foreground">
                          {p.notes}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(p.amount)}
                    </TableCell>
                    {canManageAny && (
                      <TableCell>
                        {p.userId === userId ||
                        (p.propertyId != null &&
                          manageableSet.has(p.propertyId)) ? (
                          <PaymentRowActions
                            leaseOptions={leaseOptions}
                            payment={toPaymentValues(p)}
                          />
                        ) : null}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Expenses</CardTitle>
            <CardDescription>
              Repairs, taxes, utilities, and other property costs.
            </CardDescription>
          </div>
          {canManageAny && (
            <ExpenseFormDialog
              propertyOptions={propertyOptions}
              unitOptions={unitOptions}
            />
          )}
        </CardHeader>
        <CardContent>
          {expenseRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {isFiltered
                ? "No expenses recorded for the selected properties."
                : "No expenses recorded yet. Use “Add expense” to start tracking property costs."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  {canManageAny && (
                    <TableHead className="text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenseRows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{formatDate(e.expenseDate)}</TableCell>
                    <TableCell>
                      <div>{e.propertyName ?? "—"}</div>
                      {e.unitName && (
                        <div className="text-xs text-muted-foreground">
                          {e.unitName}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{expenseCategoryLabels[e.category]}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {e.vendor ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(e.amount)}
                    </TableCell>
                    {canManageAny && (
                      <TableCell>
                        {e.userId === userId ||
                        (e.propertyId != null &&
                          manageableSet.has(e.propertyId)) ? (
                          <ExpenseRowActions
                            propertyOptions={propertyOptions}
                            unitOptions={unitOptions}
                            expense={toExpenseValues(e)}
                          />
                        ) : null}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-property P&amp;L</CardTitle>
          <CardDescription>
            {isFiltered
              ? "Income minus expenses for the selected properties."
              : "Income minus expenses for each property. Payments not linked to a lease count as unassigned."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pnlRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {isFiltered
                ? "No income or expenses for the selected properties."
                : "Record income and expenses to see per-property profitability."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property</TableHead>
                  <TableHead className="text-right">Income</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pnlRows.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell>
                      {r.label === "Unassigned" ? (
                        <span className="text-muted-foreground">Unassigned</span>
                      ) : (
                        r.label
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(r.income)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(r.expense)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(r.net)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(totalIncome)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(totalExpenses)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(net)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Proof-of-payment photos attached to a submission. Only shown for rows the
 * landlord can review, and only when a photo was actually sent — most tenants
 * just type the reference.
 */
async function ReceiptLinks({ paymentId }: { paymentId: string }) {
  const receipts = await paymentReceipts(paymentId);
  if (receipts.length === 0) return null;

  return (
    <span className="mt-1 flex flex-wrap items-center gap-2">
      {receipts.map((r) => (
        <a
          key={r.id}
          href={r.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded border bg-muted/40 px-1.5 py-0.5 text-xs font-medium text-foreground hover:bg-muted"
        >
          <PaperclipIcon className="size-3" />
          {receipts.length > 1 ? `Receipt ${r.name}` : "View receipt"}
        </a>
      ))}
    </span>
  );
}
