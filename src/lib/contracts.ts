import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  leaseContracts,
  leaseSignatures,
  leases,
  portfolios,
  properties,
  tenants,
  units,
  users,
} from "@/db/schema";
import type { ContractStatus } from "@/db/schema";

/**
 * Lease contracts.
 *
 * The problem this solves: a signature row holds a name and a timestamp. If
 * the rent is edited afterwards, the "signed lease" silently re-renders with
 * the new figure and the old signature under it. So a contract *freezes* the
 * terms as JSON at the moment of issue, renders only from that snapshot, and
 * stores a sha256 of the exact text that was shown. Changing the lease never
 * rewrites history — it supersedes the contract and starts version 2.
 *
 * Rendering is a pure function of the snapshot, and the hash is taken over that
 * same function's output, so the hash always describes what a party actually
 * saw.
 */

export const contractStatusLabels: Record<ContractStatus, string> = {
  draft: "Draft — not sent yet",
  sent: "Sent — waiting on the tenant",
  viewed: "Opened by the tenant",
  completed: "Signed by both parties",
  superseded: "Superseded by a lease edit",
  voided: "Voided",
};

/** Statuses that can still be edited, issued, or signed. */
const OPEN_STATUSES: ContractStatus[] = ["draft", "sent", "viewed"];

/**
 * The frozen snapshot. Everything the contract says comes from here — never
 * from a live join — which is what makes it a record rather than a view.
 */
export interface ContractTerms {
  // --- copied from the lease at issue time ---
  landlordName: string;
  landlordEmail: string;
  tenantName: string;
  tenantEmail: string;
  propertyName: string;
  propertyAddress: string;
  propertyCity: string;
  unitName: string;
  startDate: string; // ISO YYYY-MM-DD
  endDate: string; // "" means open-ended
  rentAmount: string; // numeric string as stored, e.g. "5000.00"
  depositAmount: string;
  // --- clauses the landlord fills in ---
  utilitiesNote: string;
  depositTerms: string;
  lateFeeNote: string;
  houseRules: string;
  repairsNote: string;
  terminationNote: string;
  additionalTerms: string;
}

export const EMPTY_CONTRACT_TERMS: ContractTerms = {
  landlordName: "",
  landlordEmail: "",
  tenantName: "",
  tenantEmail: "",
  propertyName: "",
  propertyAddress: "",
  propertyCity: "",
  unitName: "",
  startDate: "",
  endDate: "",
  rentAmount: "0.00",
  depositAmount: "0.00",
  utilitiesNote: "",
  depositTerms: "",
  lateFeeNote: "",
  houseRules: "",
  repairsNote: "",
  terminationNote: "",
  additionalTerms: "",
};

export interface ContractSection {
  heading: string;
  paragraphs: string[];
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * "1 March 2026" from an ISO date. Hand-rolled rather than Intl so the
 * rendered text — and therefore the hash — can't shift with the server's
 * locale data.
 */
export function formatLongDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso || "—";
  const [, year, month, day] = match;
  const name = MONTHS[Number(month) - 1];
  if (!name) return iso;
  return `${Number(day)} ${name} ${year}`;
}

/** "₱5,000.00" — grouped by hand for the same reason as the date. */
export function formatPeso(amount: string | number): string {
  const numeric = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(numeric)) return `₱${amount || "0.00"}`;
  const [whole, fraction = "00"] = numeric.toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `₱${grouped}.${fraction}`;
}

function line(address: string, city: string): string {
  return [address, city].filter(Boolean).join(", ") || "—";
}

/**
 * The contract as a list of numbered clauses. Optional clauses are omitted
 * entirely when the landlord left them blank — no empty headings, no
 * "not specified" filler.
 */
export function renderContractSections(terms: ContractTerms): ContractSection[] {
  const sections: ContractSection[] = [
    {
      heading: "The parties",
      paragraphs: [
        `This agreement is made between ${terms.landlordName || "the landlord"} (the "Landlord"), of ${terms.landlordEmail || "no email on record"}, and ${terms.tenantName || "the tenant"} (the "Tenant"), of ${terms.tenantEmail || "no email on record"}.`,
      ],
    },
    {
      heading: "The premises",
      paragraphs: [
        `The Landlord rents to the Tenant the unit known as ${terms.unitName || "—"} at ${terms.propertyName || "—"}, ${line(terms.propertyAddress, terms.propertyCity)}.`,
      ],
    },
    {
      heading: "The term",
      paragraphs: [
        terms.endDate
          ? `The tenancy begins on ${formatLongDate(terms.startDate)} and ends on ${formatLongDate(terms.endDate)}.`
          : `The tenancy begins on ${formatLongDate(terms.startDate)} and continues from month to month until either party gives notice as agreed.`,
      ],
    },
    {
      heading: "Rent",
      paragraphs: [
        `The Tenant shall pay the Landlord a monthly rent of ${formatPeso(terms.rentAmount)}, payable on the date the Landlord requests each month through GCash or bank transfer.`,
        "The Landlord shall record each payment in RentBase-PH, and the Tenant's receipt is the payment history shown in their portal.",
      ],
    },
    {
      heading: "Security deposit",
      paragraphs: terms.depositTerms
        ? [
            `The Tenant shall pay a security deposit of ${formatPeso(terms.depositAmount)}. ${terms.depositTerms}`,
          ]
        : [
            `The Tenant shall pay a security deposit of ${formatPeso(terms.depositAmount)}.`,
          ],
    },
  ];

  // Optional clauses, in the order a landlord reads them.
  const optional: Array<[string, string]> = [
    ["Utilities and other charges", terms.utilitiesNote],
    ["Late payment", terms.lateFeeNote],
    ["Repairs and maintenance", terms.repairsNote],
    ["Termination and move-out", terms.terminationNote],
    ["House rules", terms.houseRules],
    ["Additional terms", terms.additionalTerms],
  ];
  for (const [heading, body] of optional) {
    if (body.trim()) sections.push({ heading, paragraphs: [body.trim()] });
  }

  return sections;
}

/**
 * The plain-text contract. This exact string is what gets hashed, so it must
 * contain every clause and nothing that varies per viewer — no timestamps, no
 * version-specific wording.
 */
export function renderContractText(terms: ContractTerms): string {
  const lines: string[] = ["LEASE AGREEMENT", ""];
  const sections = renderContractSections(terms);
  sections.forEach((section, index) => {
    lines.push(`${index + 1}. ${section.heading.toUpperCase()}`);
    for (const paragraph of section.paragraphs) lines.push(paragraph);
    lines.push("");
  });
  return lines.join("\n");
}

/** sha256 of the rendered text — what a signature is really attesting to. */
export function hashContractTerms(terms: ContractTerms): string {
  return createHash("sha256").update(renderContractText(terms), "utf8").digest("hex");
}

/** Short, human-readable form of the hash for the UI. */
export function shortHash(hash: string): string {
  return hash.slice(0, 12);
}

export function parseContractTerms(json: string): ContractTerms {
  try {
    const parsed = JSON.parse(json) as Partial<ContractTerms>;
    // Spread over the empty shape so a snapshot written by an older build
    // (missing a clause) still renders instead of throwing.
    return { ...EMPTY_CONTRACT_TERMS, ...parsed };
  } catch {
    return { ...EMPTY_CONTRACT_TERMS };
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface ContractRecord {
  id: string;
  leaseId: string;
  version: number;
  terms: ContractTerms;
  contentHash: string;
  status: ContractStatus;
  issuedAt: Date | null;
  viewedAt: Date | null;
  landlordSignedAt: Date | null;
  tenantSignedAt: Date | null;
  completedAt: Date | null;
  voidedAt: Date | null;
  createdAt: Date;
}

function toRecord(row: typeof leaseContracts.$inferSelect): ContractRecord {
  return {
    id: row.id,
    leaseId: row.leaseId,
    version: row.version,
    terms: parseContractTerms(row.terms),
    contentHash: row.contentHash,
    status: row.status,
    issuedAt: row.issuedAt,
    viewedAt: row.viewedAt,
    landlordSignedAt: row.landlordSignedAt,
    tenantSignedAt: row.tenantSignedAt,
    completedAt: row.completedAt,
    voidedAt: row.voidedAt,
    createdAt: row.createdAt,
  };
}

/** Every contract for a lease, newest version first. */
export async function contractHistory(leaseId: string): Promise<ContractRecord[]> {
  const rows = await db
    .select()
    .from(leaseContracts)
    .where(eq(leaseContracts.leaseId, leaseId))
    .orderBy(desc(leaseContracts.version));
  return rows.map(toRecord);
}

/** The contract still in play — the one that isn't finished or thrown away. */
export async function activeContract(leaseId: string): Promise<ContractRecord | null> {
  const [row] = await db
    .select()
    .from(leaseContracts)
    .where(
      and(eq(leaseContracts.leaseId, leaseId), inArray(leaseContracts.status, OPEN_STATUSES)),
    )
    .orderBy(desc(leaseContracts.version))
    .limit(1);
  return row ? toRecord(row) : null;
}

/** The newest completed contract, if both parties have ever signed one. */
export async function completedContract(leaseId: string): Promise<ContractRecord | null> {
  const [row] = await db
    .select()
    .from(leaseContracts)
    .where(
      and(eq(leaseContracts.leaseId, leaseId), eq(leaseContracts.status, "completed")),
    )
    .orderBy(desc(leaseContracts.version))
    .limit(1);
  return row ? toRecord(row) : null;
}

export async function getContract(contractId: string): Promise<ContractRecord | null> {
  const [row] = await db
    .select()
    .from(leaseContracts)
    .where(eq(leaseContracts.id, contractId))
    .limit(1);
  return row ? toRecord(row) : null;
}

export interface ContractSignature {
  role: "landlord" | "tenant";
  signerName: string;
  method: "typed" | "drawn";
  signature: string;
  signedAt: Date;
}

/** The signature pair bound to one contract version. */
export async function signaturesForContract(
  contractId: string,
): Promise<Record<"landlord" | "tenant", ContractSignature | null>> {
  const rows = await db
    .select()
    .from(leaseSignatures)
    .where(eq(leaseSignatures.contractId, contractId));

  const byRole: Record<"landlord" | "tenant", ContractSignature | null> = {
    landlord: null,
    tenant: null,
  };
  for (const row of rows) {
    byRole[row.role] = {
      role: row.role,
      signerName: row.signerName,
      method: row.method,
      signature: row.signature,
      signedAt: row.signedAt,
    };
  }
  return byRole;
}

/**
 * What the signature card should show for a lease: the contract-bound pair when
 * a contract exists, otherwise the unbound legacy signature. Both parties can
 * end up with two marks — one per version — and only the current one counts.
 */
export async function effectiveSignatures(
  leaseId: string,
  contract: ContractRecord | null,
): Promise<Record<"landlord" | "tenant", ContractSignature | null>> {
  if (contract) return signaturesForContract(contract.id);

  const rows = await db
    .select()
    .from(leaseSignatures)
    .where(
      and(eq(leaseSignatures.leaseId, leaseId), isNull(leaseSignatures.contractId)),
    );
  const byRole: Record<"landlord" | "tenant", ContractSignature | null> = {
    landlord: null,
    tenant: null,
  };
  for (const row of rows) {
    byRole[row.role] = {
      role: row.role,
      signerName: row.signerName,
      method: row.method,
      signature: row.signature,
      signedAt: row.signedAt,
    };
  }
  return byRole;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Sign one version of a contract, and advance its state.
 *
 * The signature row carries `contract_id`, which is the whole point: version 1
 * keeps its marks even after version 2 is issued, so a completed contract
 * stays a complete record rather than being overwritten by a later agreement.
 */
export async function signContract(input: {
  contractId: string;
  role: "landlord" | "tenant";
  signerName: string;
  method: "typed" | "drawn";
  signature: string;
}): Promise<void> {
  const contract = await getContract(input.contractId);
  if (!contract) throw new Error("That contract could not be found.");
  if (!OPEN_STATUSES.includes(contract.status)) {
    throw new Error("This contract can no longer be signed.");
  }
  // Only a draft the landlord is still working on can't be signed by anyone.
  if (contract.status === "draft") {
    throw new Error("This contract hasn't been sent yet.");
  }

  const signedAt = new Date();
  await db
    .insert(leaseSignatures)
    .values({
      leaseId: contract.leaseId,
      contractId: contract.id,
      role: input.role,
      signerName: input.signerName,
      method: input.method,
      signature: input.signature,
      signedAt,
    })
    .onConflictDoUpdate({
      target: [leaseSignatures.contractId, leaseSignatures.role],
      // The uniqueness rule is a *partial* index (one pair per contract,
      // ignoring unbound rows), so Postgres only infers it when the statement
      // repeats the same predicate.
      targetWhere: sql`${leaseSignatures.contractId} is not null`,
      set: {
        signerName: input.signerName,
        method: input.method,
        signature: input.signature,
        signedAt,
      },
    });

  const patch: Partial<typeof leaseContracts.$inferInsert> = {};
  if (input.role === "landlord") patch.landlordSignedAt = signedAt;
  else patch.tenantSignedAt = signedAt;

  const otherSigned =
    input.role === "landlord" ? contract.tenantSignedAt : contract.landlordSignedAt;
  if (otherSigned) {
    patch.status = "completed";
    patch.completedAt = signedAt;
  }
  // Deliberately no sent → viewed transition here: "opened by the tenant" is a
  // statement about the tenant, and the landlord commonly signs first. Only
  // markContractViewed may set it.

  await db
    .update(leaseContracts)
    .set(patch)
    .where(eq(leaseContracts.id, contract.id));
}

/** Note that the tenant opened the contract. Idempotent — first view only. */
export async function markContractViewed(contractId: string): Promise<void> {
  const [row] = await db
    .select({ id: leaseContracts.id, status: leaseContracts.status })
    .from(leaseContracts)
    .where(eq(leaseContracts.id, contractId))
    .limit(1);
  if (!row || row.status !== "sent") return;

  await db
    .update(leaseContracts)
    .set({ status: "viewed", viewedAt: new Date() })
    .where(and(eq(leaseContracts.id, contractId), eq(leaseContracts.status, "sent")));
}

/**
 * Retire any contract still in flight for a lease. Called when the lease itself
 * changes: the snapshot no longer matches the lease, so it must not be
 * signable — but it is never deleted, because it is the record of what was
 * offered.
 */
export async function supersedeOpenContracts(leaseId: string): Promise<number> {
  const open = await db
    .select({ id: leaseContracts.id })
    .from(leaseContracts)
    .where(
      and(eq(leaseContracts.leaseId, leaseId), inArray(leaseContracts.status, OPEN_STATUSES)),
    );
  if (open.length === 0) return 0;

  await db
    .update(leaseContracts)
    .set({ status: "superseded" })
    .where(
      inArray(
        leaseContracts.id,
        open.map((row) => row.id),
      ),
    );
  return open.length;
}

/**
 * Compare a signed contract against the lease as it stands now. Returns the
 * fields that moved after signing — the warning that turns "the rent changed
 * and nobody noticed" into something the landlord has to look at.
 */
export async function contractDrift(
  leaseId: string,
  contract: ContractRecord | null,
): Promise<string[]> {
  if (!contract) return [];

  const [lease] = await db
    .select({
      startDate: leases.startDate,
      endDate: leases.endDate,
      rentAmount: leases.rentAmount,
      depositAmount: leases.depositAmount,
    })
    .from(leases)
    .where(eq(leases.id, leaseId))
    .limit(1);
  if (!lease) return [];

  const drift: string[] = [];
  const iso = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : "");

  if (iso(lease.startDate) !== contract.terms.startDate) drift.push("start date");
  if (iso(lease.endDate) !== contract.terms.endDate) drift.push("end date");
  if (Number(lease.rentAmount) !== Number(contract.terms.rentAmount)) drift.push("monthly rent");
  if (Number(lease.depositAmount) !== Number(contract.terms.depositAmount)) {
    drift.push("security deposit");
  }
  return drift;
}

/** Draft a fresh snapshot from the lease as it currently stands. */
export async function draftTermsFromLease(leaseId: string): Promise<ContractTerms | null> {
  const [row] = await db
    .select({
      startDate: leases.startDate,
      endDate: leases.endDate,
      rentAmount: leases.rentAmount,
      depositAmount: leases.depositAmount,
      tenantFirst: tenants.firstName,
      tenantLast: tenants.lastName,
      tenantEmail: tenants.email,
      unitName: units.name,
      propertyName: properties.name,
      propertyAddress: properties.address,
      propertyCity: properties.city,
      // The landlord on the contract is the portfolio *owner*, matching how
      // payout details and the "your landlord" label already resolve — a
      // co-tenant who prepares the contract doesn't become the counterparty.
      landlordName: users.name,
      landlordEmail: users.email,
    })
    .from(leases)
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .innerJoin(units, eq(units.id, leases.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .innerJoin(portfolios, eq(portfolios.id, properties.portfolioId))
    .innerJoin(users, eq(users.id, portfolios.ownerUserId))
    .where(eq(leases.id, leaseId))
    .limit(1);
  if (!row) return null;

  const iso = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : "");

  return {
    ...EMPTY_CONTRACT_TERMS,
    landlordName: row.landlordName ?? "",
    landlordEmail: row.landlordEmail,
    tenantName: `${row.tenantFirst} ${row.tenantLast}`.trim(),
    tenantEmail: row.tenantEmail ?? "",
    propertyName: row.propertyName,
    propertyAddress: row.propertyAddress ?? "",
    propertyCity: row.propertyCity ?? "",
    unitName: row.unitName,
    startDate: iso(row.startDate),
    endDate: iso(row.endDate),
    rentAmount: String(row.rentAmount),
    depositAmount: String(row.depositAmount),
  };
}