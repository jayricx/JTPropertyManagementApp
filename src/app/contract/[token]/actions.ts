"use server";

import { revalidatePath } from "next/cache";
import { resolveAccessToken, signContract } from "@/lib/contracts";
import { leaseSignatureSchema } from "@/lib/validations";

export type ActionState = { error?: string; ok?: boolean } | null;

/**
 * Sign a contract from an emailed link, with no account involved.
 *
 * The token is the authorisation, and it's checked twice: once to find the
 * contract and once inside `signContract`, which re-reads the row and refuses
 * anything superseded, voided or expired. The role is hard-coded to `tenant`
 * — a link can never produce a landlord's signature, however it's tampered
 * with.
 */
export async function signContractByTokenAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const token = String(formData.get("token") ?? "");
  const contractId = String(formData.get("contractId") ?? "");

  const found = await resolveAccessToken(token);
  if (!found || found.contract.id !== contractId || !found.linkValid) {
    return { error: "This signing link is no longer valid." };
  }

  const parsed = leaseSignatureSchema.safeParse({
    signerName: formData.get("signerName"),
    method: formData.get("method"),
    drawnSignature: formData.get("drawnSignature") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid signature." };
  }
  if (formData.get("attestation") !== "on") {
    return { error: "Tick the agreement box to sign." };
  }

  const signature =
    parsed.data.method === "typed"
      ? parsed.data.signerName
      : (parsed.data.drawnSignature ?? "");
  if (!signature) return { error: "Draw your signature before signing." };

  try {
    await signContract({
      contractId: found.contract.id,
      role: "tenant",
      signerName: parsed.data.signerName,
      method: parsed.data.method,
      signature,
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Signing failed.",
    };
  }

  // The landlord's lease page watches for exactly this.
  revalidatePath(`/leases/${found.contract.leaseId}/contract`);
  revalidatePath(`/leases/${found.contract.leaseId}/edit`);
  return { ok: true };
}