import { redirect } from "next/navigation";
import { auth } from "@/auth";

/**
 * Single landing spot for every sign-in method. Checks the account's role
 * server-side and forwards to the right home, so tenants never see the
 * landlord dashboard flash and landlords never see the portal.
 */
export default async function PostLoginPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "tenant") redirect("/portal");
  redirect("/dashboard");
}