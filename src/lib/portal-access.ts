import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tenants } from "@/db/schema";

/**
 * Portal access follows the data, not the account's primary role.
 *
 * A landlord can rent from another landlord, so the same account may be both
 * an owner (dashboard) and a tenant (portal). Being linked to a tenant roster
 * entry — `tenants.account_id` — is what grants the portal; `users.role` only
 * decides the default landing page.
 */
export async function userHasTenantProfile(accountId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.accountId, accountId))
    .limit(1);
  return Boolean(row);
}
