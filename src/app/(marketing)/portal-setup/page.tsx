import { auth } from "@/auth";
import { googleSignInEnabled } from "@/lib/auth-providers";
import { CompleteTenantSetup } from "./complete-tenant-setup";

/**
 * Public route for the link emailed to a tenant when the landlord grants
 * portal access. The token arrives as a query parameter — read here on the
 * server rather than with `useSearchParams()` inside this page, which would
 * opt the route out of static rendering and fail the production build.
 *
 * The signed-in state is passed down as well: a tenant who chooses "Continue
 * with Google" comes back here already authenticated, and the form finishes
 * the link without asking them to pick a password. `googleSignInEnabled()` is
 * read per request so the button can be switched on or off without a rebuild.
 */
export default async function PortalSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const session = await auth();
  return (
    <CompleteTenantSetup
      token={token ?? ""}
      googleEnabled={googleSignInEnabled()}
      signedInEmail={session?.user?.email ?? null}
    />
  );
}
