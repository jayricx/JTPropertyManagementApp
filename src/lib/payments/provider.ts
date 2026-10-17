import { paymongoEnabled } from "@/lib/payments/paymongo";

/**
 * Whether the tenant portal should offer card checkout. Card payments run on
 * PayMongo's hosted page; Xendit/Stripe could slot in behind the same seam
 * later, but until they're implemented only PayMongo turns the option on — so
 * the button never appears unless it can actually complete a charge.
 */
export function cardCheckoutEnabled(): boolean {
  return paymongoEnabled();
}
