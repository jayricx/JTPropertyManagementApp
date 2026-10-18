"use server";

import { revalidatePath } from "next/cache";
import { resolveAccessToken, signContract } from "@/lib/contracts";
import {
  emailCodeVerification,
  maskEmail,
  requestSignatureCode,
  verifyCodeMessages,
  verifySignatureChallenge,
  type SignatureCodeState,
} from "@/lib/signature-verification";
import { leaseSignatureSchema } from "@/lib/validations";

export type ActionState = { error?: string; ok?: boolean } | null;

/**
 * Mail a signing code to the address this contract was sent to.
 *
 * The token is the only thing that authorises this: there is no session, and
 * the address comes from the frozen terms rather than the request, so a visitor
 * can't redirect the code to themselves.
 */
export async function sendContractSignatureCodeAction(
  contractId: string,
  token: string,
): Promise<SignatureCodeState> {
  const found = await resolveAccessToken(token);
  if (!found || found.contract.id !== contractId || !found.linkValid) {
    return {
      ok: false,
      error: "This signing link is no longer valid.",
      retryInSeconds: 0,
    };
  }

  const { contract } = found;
  if (contract.status !== "sent" && contract.status !== "viewed") {
    return {
      ok: false,
      error: "This contract can no longer be signed.",
      retryInSeconds: 0,
    };
  }

  const email = contract.terms.tenantEmail.trim();
  if (!email) {
    return {
      ok: false,
      error:
        "There's no email address on this contract. Ask your landlord to add one and send it again.",
      retryInSeconds: 0,
    };
  }

  const result = await requestSignatureCode({
    contractId: contract.id,
    role: "tenant",
    email,
    signerName: contract.terms.tenantName,
    landlordLabel:
      contract.terms.landlordBusinessName.trim() ||
      contract.terms.landlordName.trim() ||
      "your landlord",
    propertyLine: [contract.terms.propertyName, contract.terms.unitName]
      .filter(Boolean)
      .join(", "),
  });

  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "throttled"
          ? `A code was just sent. Try again in ${result.retryInSeconds} seconds.`
          : "There's no email address on this contract.",
      retryInSeconds: result.retryInSeconds,
    };
  }

  return {
    ok: true,
    delivered: result.delivered,
    email: maskEmail(email),
    retryInSeconds: 0,
  };
}

/**
 * Sign a contract from an emailed link, with no account involved.
 *
 * The token is the authorisation, and it's checked twice: once to find the
 * contract and once inside `signContract`, which re-reads the row and refuses
 * anything superseded, voided or expired. The role is hard-coded to `tenant`
 * — a link can never produce a landlord's signature, however it's tampered
 * with.
 *
 * Possession of the link is no longer enough on its own: the signer also has
 * to enter a code sent to the address the contract was emailed to, and the
 * signature records that verification along with the request's address and
 * browser.
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
  // Checked before the code is spent, so a finished or unissued contract can't
  // burn a fresh code on a request that was never going to sign.
  if (
    found.contract.status !== "sent" &&
    found.contract.status !== "viewed"
  ) {
    return { error: "This contract can no longer be signed." };
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

  // Spend the emailed code before writing the signature. A code admits one
  // signature; asking for another is a fresh code, by design.
  const codeCheck = await verifySignatureChallenge(
    found.contract.id,
    "tenant",
    String(formData.get("code") ?? ""),
  );
  if (!codeCheck.ok) {
    return { error: verifyCodeMessages[codeCheck.reason] };
  }

  try {
    await signContract({
      contractId: found.contract.id,
      role: "tenant",
      signerName: parsed.data.signerName,
      method: parsed.data.method,
      signature,
      verification: await emailCodeVerification(),
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
