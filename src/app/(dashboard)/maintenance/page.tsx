import { asc, eq, inArray, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import {
  documents,
  maintenanceRequests,
  properties,
  tenants,
  units,
} from "@/db/schema";
import { Badge } from "@/components/ui/badge";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MaintenanceFormDialog } from "@/components/maintenance/maintenance-form-dialog";
import {
  RequestMediaStrip,
  type RequestMediaItem,
} from "@/components/maintenance/request-media";
import { MaintenanceRowActions } from "@/components/maintenance/maintenance-row-actions";
import { accessiblePropertyIds, manageablePropertyIds } from "@/lib/access";
import { activePortfolioId } from "@/lib/portfolios";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  maintenancePriorityLabels,
  maintenanceStatusLabels,
  type MaintenanceFormValues,
  type MaintenancePriority,
  type MaintenanceStatus,
} from "@/lib/validations";

const statusClass: Record<MaintenanceStatus, string> = {
  new: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-400",
  in_progress:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400",
  resolved:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400",
  cancelled: "border-border bg-muted text-muted-foreground",
};

const priorityClass: Record<MaintenancePriority, string> = {
  urgent:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400",
  high:
    "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-400",
  medium:
    "border-border bg-muted text-muted-foreground",
  low: "border-border bg-muted text-muted-foreground",
};

export default async function MaintenancePage() {
  const session = await auth();
  const userId = session?.user?.id;
  // The dashboard layout redirects unauthenticated visitors.
  if (!userId) return null;

  // Requests are scoped to shared properties, so owner and co-owner both
  // see everything filed there — but only they can act on it (viewers read).
  const [accessibleIds, manageableIds, portfolioId] = await Promise.all([
    accessiblePropertyIds(userId),
    manageablePropertyIds(userId),
    activePortfolioId(userId),
  ]);
  const canManageAny = manageableIds.length > 0;
  const manageableSet = new Set(manageableIds);


  const [requestRows, propertyRows, unitRows, tenantRows] = await Promise.all([
    db
      .select({
        id: maintenanceRequests.id,
        propertyId: maintenanceRequests.propertyId,
        unitId: maintenanceRequests.unitId,
        tenantId: maintenanceRequests.tenantId,
        title: maintenanceRequests.title,
        description: maintenanceRequests.description,
        status: maintenanceRequests.status,
        priority: maintenanceRequests.priority,
        cost: maintenanceRequests.cost,
        resolvedAt: maintenanceRequests.resolvedAt,
        propertyName: properties.name,
        unitName: units.name,
        tenantFirst: tenants.firstName,
        tenantLast: tenants.lastName,
      })
      .from(maintenanceRequests)
      .innerJoin(properties, eq(maintenanceRequests.propertyId, properties.id))
      .innerJoin(units, eq(maintenanceRequests.unitId, units.id))
      .leftJoin(tenants, eq(maintenanceRequests.tenantId, tenants.id))
      .where(inArray(maintenanceRequests.propertyId, accessibleIds))
      // Open requests first, then resolved, then cancelled — newest first.
      .orderBy(
        sql`case ${maintenanceRequests.status} when 'new' then 0 when 'in_progress' then 1 when 'resolved' then 2 else 3 end`,
        sql`case ${maintenanceRequests.priority} when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end`,
        sql`${maintenanceRequests.createdAt} desc`,
      ),
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
    db
      .select({
        id: tenants.id,
        firstName: tenants.firstName,
        lastName: tenants.lastName,
      })
      .from(tenants)
      .where(eq(tenants.portfolioId, portfolioId ?? ""))
      .orderBy(asc(tenants.lastName), asc(tenants.firstName)),
  ]);

  // Photos/video the tenant attached to each report.
  const mediaByRequest = new Map<string, RequestMediaItem[]>();
  if (requestRows.length) {
    const mediaRows = await db
      .select({
        id: documents.id,
        maintenanceRequestId: documents.maintenanceRequestId,
        name: documents.name,
        type: documents.type,
        sizeBytes: documents.sizeBytes,
      })
      .from(documents)
      .where(
        inArray(
          documents.maintenanceRequestId,
          requestRows.map((r) => r.id),
        ),
      );
    for (const m of mediaRows) {
      if (!m.maintenanceRequestId) continue;
      const list = mediaByRequest.get(m.maintenanceRequestId) ?? [];
      list.push({ id: m.id, name: m.name, type: m.type, sizeBytes: m.sizeBytes });
      mediaByRequest.set(m.maintenanceRequestId, list);
    }
  }

  const propertyOptions = propertyRows.map((p) => ({ id: p.id, label: p.name }));
  const unitOptions = unitRows.map((u) => ({
    id: u.id,
    propertyId: u.propertyId,
    label: u.name,
  }));
  const tenantOptions = tenantRows.map((t) => ({
    id: t.id,
    label: `${t.firstName} ${t.lastName}`,
  }));

  const toFormValues = (
    r: (typeof requestRows)[number],
  ): MaintenanceFormValues & { id: string } => ({
    id: r.id,
    propertyId: r.propertyId,
    unitId: r.unitId,
    tenantId: r.tenantId ?? "",
    title: r.title,
    description: r.description ?? "",
    status: r.status,
    priority: r.priority,
    cost: r.cost === null ? "" : Number(r.cost),
  });

  const openCount = requestRows.filter(
    (r) => r.status === "new" || r.status === "in_progress",
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Maintenance</h1>
          <p className="text-muted-foreground">
            Track repair requests from new to resolved.
          </p>
        </div>
        {canManageAny && (
          <MaintenanceFormDialog
            propertyOptions={propertyOptions}
            unitOptions={unitOptions}
            tenantOptions={tenantOptions}
          />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Requests</CardTitle>
          <CardDescription>
            {requestRows.length === 0
              ? "No requests yet."
              : `${openCount} open · ${requestRows.length} total`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {requestRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {canManageAny
                ? "No maintenance requests yet. Use \u201cNew request\u201d to log a repair for one of your units."
                : "No maintenance requests yet."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Request</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  {canManageAny && (
                    <TableHead className="text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {requestRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.title}</div>
                      {r.description && (
                        <div className="line-clamp-1 text-xs text-muted-foreground">
                          {r.description}
                        </div>
                      )}
                      <RequestMediaStrip
                        items={mediaByRequest.get(r.id) ?? []}
                        size="xs"
                      />
                    </TableCell>
                    <TableCell>
                      <div>{r.unitName}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.propertyName}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.tenantFirst
                        ? `${r.tenantFirst} ${r.tenantLast}`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={priorityClass[r.priority]}
                      >
                        {maintenancePriorityLabels[r.priority]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusClass[r.status]}>
                        {maintenanceStatusLabels[r.status]}
                      </Badge>
                      {r.resolvedAt && r.status === "resolved" && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {formatDate(r.resolvedAt)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.cost === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        formatCurrency(r.cost)
                      )}
                    </TableCell>
                    {canManageAny && (
                      <TableCell>
                        {manageableSet.has(r.propertyId) ? (
                          <MaintenanceRowActions
                            propertyOptions={propertyOptions}
                            unitOptions={unitOptions}
                            tenantOptions={tenantOptions}
                            request={toFormValues(r)}
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
    </div>
  );
}
