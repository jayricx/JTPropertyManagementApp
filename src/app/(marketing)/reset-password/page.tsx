import { ResetPasswordForm } from "./reset-password-form";

/**
 * Server component so `?token=` can be read during render. The form is a
 * client child, but it receives the token as a prop — reading the param with
 * `useSearchParams()` here instead would opt the route out of static
 * rendering and fail the production build.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <ResetPasswordForm token={token ?? ""} />;
}