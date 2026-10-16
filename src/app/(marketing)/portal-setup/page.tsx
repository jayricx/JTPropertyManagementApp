import { CompleteTenantSetup } from "./complete-tenant-setup";

/**
 * Public route for the link emailed to a tenant when the landlord grants
 * portal access. The token arrives as a query parameter — read here on the
 * server rather than with `useSearchParams()` inside this page, which would
 * opt the route out of static rendering and fail the production build.
 */
export default async function PortalSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <CompleteTenantSetup token={token ?? ""} />;
}
