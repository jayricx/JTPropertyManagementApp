import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
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
import {
  FILIPINO_MONTHS,
  type ContractLanguage,
  type ContractPresetId,
} from "@/lib/contract-templates";

export type { ContractLanguage, ContractPresetId };
import type { SignatureVerification } from "@/lib/signature-verification";
import type { SignatureVerifiedBy } from "@/lib/signatures";

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
 * Which party wording a snapshot was drafted with.
 *
 * The prose is part of what a signature attests to, so it is versioned *inside*
 * the snapshot rather than decided at render time: contracts drafted from now
 * on say Lessor/Lessee, while anything created earlier keeps the
 * Landlord/Tenant wording it was signed under. Editing the renderer must never
 * silently rewrite an executed contract — the stored hash would no longer
 * describe the text on screen.
 */
export const LEGACY_CONTRACT_RENDER_VERSION = 1;
export const CURRENT_CONTRACT_RENDER_VERSION = 2;

/**
 * The frozen snapshot. Everything the contract says comes from here — never
 * from a live join — which is what makes it a record rather than a view.
 */
export interface ContractTerms {
  // --- copied from the lease at issue time ---
  landlordName: string;
  /** Trading name, when the portfolio has one; replaces the personal name. */
  landlordBusinessName: string;
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
  /**
   * The party wording this snapshot renders with. Absent on snapshots written
   * before the wording was versioned, which are read as the legacy version.
   */
  renderVersion: number;
  /** Which language the template prose is rendered in. Absent → English. */
  language?: ContractLanguage;
  /** Which clause preset seeded this draft. Absent → residential. */
  presetId?: ContractPresetId;
}

export const EMPTY_CONTRACT_TERMS: ContractTerms = {
  landlordName: "",
  landlordBusinessName: "",
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
  // The default is the *legacy* wording on purpose: a snapshot that predates
  // this field must render the words it was signed under, and a new draft sets
  // the current version explicitly when it is built.
  renderVersion: LEGACY_CONTRACT_RENDER_VERSION,
};

/** The words the contract uses for each party, by snapshot version. */
export interface ContractPartyWords {
  lessor: string;
  lessee: string;
}

export function contractPartyWords(terms: ContractTerms): ContractPartyWords {
  return terms.renderVersion >= CURRENT_CONTRACT_RENDER_VERSION
    ? { lessor: "Lessor", lessee: "Lessee" }
    : { lessor: "Landlord", lessee: "Tenant" };
}

/** The snapshot's language, defaulting to English for older snapshots. */
export function contractLanguage(terms: ContractTerms): ContractLanguage {
  return terms.language ?? "en";
}

export interface ContractSection {
  heading: string;
  paragraphs: string[];
  /**
   * The landlord's own wording for this clause, if any — kept apart from the
   * template prose because it cannot be translated. In a bilingual contract it
   * is therefore emitted **once**, after both languages, rather than pasted
   * into each. Duplicating it reads as a drafting error.
   */
  note?: string;
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
 * The English clauses.
 *
 * Optional clauses are omitted entirely when the landlord left them blank — no
 * empty headings, no "not specified" filler.
 */
function englishSections(terms: ContractTerms): ContractSection[] {
  const words = contractPartyWords(terms);
  // A lease counterparty has to be identifiable, not just reachable — so a
  // trading name replaces the personal one when there is one, and the person
  // behind it is named anyway so there's never an unaccountable "the Lessor".
  const trading = terms.landlordBusinessName.trim();
  const personal = terms.landlordName.trim();
  const landlord =
    trading && trading.toLowerCase() !== personal.toLowerCase()
      ? `${trading}, through ${personal}`
      : trading || personal || `the ${words.lessor}`;

  const sections: ContractSection[] = [
    {
      heading: "The parties",
      paragraphs: [
        `This agreement is made between ${landlord} (the "${words.lessor}"), of ${terms.landlordEmail || "no email on record"}, and ${terms.tenantName || `the ${words.lessee}`} (the "${words.lessee}"), of ${terms.tenantEmail || "no email on record"}.`,
      ],
    },
    {
      heading: "The premises",
      paragraphs: [
        `The ${words.lessor} rents to the ${words.lessee} the unit known as ${terms.unitName || "—"} at ${terms.propertyName || "—"}, ${line(terms.propertyAddress, terms.propertyCity)}.`,
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
        `The ${words.lessee} shall pay the ${words.lessor} a monthly rent of ${formatPeso(terms.rentAmount)}, payable on the date the ${words.lessor} requests each month through GCash or bank transfer.`,
        `The ${words.lessor} shall record each payment in Renta-PH.net, and the ${words.lessee}'s receipt is the payment history shown in their portal.`,
      ],
    },
    {
      heading: "Security deposit",
      paragraphs: [
        `The ${words.lessee} shall pay a security deposit of ${formatPeso(terms.depositAmount)}.`,
      ],
      note: terms.depositTerms.trim() || undefined,
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
    if (body.trim()) {
      sections.push({ heading, paragraphs: [], note: body.trim() });
    }
  }

  return sections;
}

/** "1 Marso 2026" — hand-rolled, for the same reason as the English date. */
export function formatFilipinoDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso || "—";
  const [, year, month, day] = match;
  const name = FILIPINO_MONTHS[Number(month) - 1];
  if (!name) return iso;
  return `${Number(day)} ${name} ${year}`;
}

/**
 * The Filipino clauses. Deliberately mirrors `englishSections` clause for
 * clause so a bilingual contract reads as one agreement in two languages rather
 * than two documents stapled together.
 *
 * "Lessor" and "Lessee" are kept untranslated: that is what a Filipino tenancy
 * agreement actually uses, and translating them would make the document look
 * foreign to the people most likely to be signing it.
 */
function filipinoSections(terms: ContractTerms): ContractSection[] {
  const { lessor, lessee } = contractPartyWords(terms);
  const trading = terms.landlordBusinessName.trim();
  const personal = terms.landlordName.trim();
  const landlord =
    trading && trading.toLowerCase() !== personal.toLowerCase()
      ? `${trading}, sa pamamagitan ni ${personal}`
      : trading || personal || `ang ${lessor}`;

  const sections: ContractSection[] = [
    {
      heading: "Ang mga parties",
      paragraphs: [
        `Naghahawak ang kasunduang ito ng ${landlord} (ang "${lessor}"), na may email na ${terms.landlordEmail || "wala sa tala"}, at ${terms.tenantName || `ang ${lessee}`} (ang "${lessee}"), na may email na ${terms.tenantEmail || "wala sa tala"}.`,
      ],
    },
    {
      heading: "Ang paksa",
      paragraphs: [
        `Ini-renta ng ${lessor} sa ${lessee} ang yunit na kilala bilang ${terms.unitName || "—"} sa ${terms.propertyName || "—"}, ${line(terms.propertyAddress, terms.propertyCity)}.`,
      ],
    },
    {
      heading: "Ang panahon",
      paragraphs: [
        terms.endDate
          ? `Nagsisimula ang pagliliwat noong ${formatFilipinoDate(terms.startDate)} at natatapos noong ${formatFilipinoDate(terms.endDate)}.`
          : `Nagsisimula ang pagliliwat noong ${formatFilipinoDate(terms.startDate)} at magpapatuloy hanggang magbigay man ang kahit na isa sa dalawang parties ng abiso ayon sa kasunduan.`,
      ],
    },
    {
      heading: "Ang upat",
      paragraphs: [
        `Bayaran ng ${lessee} sa ${lessor} ang buwaning upat na ${formatPeso(terms.rentAmount)}, sa petsa na hinihingi ng ${lessor} tuwing buwan gamit ang GCash o bank transfer.`,
        `Itatala ng ${lessor} ang bawat bayad sa Renta-PH.net, at ang resibo ng ${lessee} ay ang kasaysayan ng bayad na nakikita sa portal nila.`,
      ],
    },
    {
      heading: "Ang security deposit",
      paragraphs: [
        `Magbabayad ang ${lessee} ng security deposit na ${formatPeso(terms.depositAmount)}.`,
      ],
      note: terms.depositTerms.trim() || undefined,
    },
  ];

  const optional: Array<[string, string]> = [
    ["Mga utility at iba pang bayarin", terms.utilitiesNote],
    ["Huling pagbabayad", terms.lateFeeNote],
    ["Pagkukumpuni at pagpapanatili", terms.repairsNote],
    ["Pagtatapos ng kasunduan at paglikas", terms.terminationNote],
    ["Mga patakaran ng bahay", terms.houseRules],
    ["Karagdagang kasunduan", terms.additionalTerms],
  ];
  for (const [heading, body] of optional) {
    if (body.trim()) {
      sections.push({ heading, paragraphs: [], note: body.trim() });
    }
  }

  return sections;
}

/**
 * The contract as a list of numbered clauses, in the snapshot's language.
 *
 * For `both`, each clause carries its two headings and its two sets of
 * template paragraphs in one numbered block — adjacent, so the two languages
 * can never be mistaken for separate terms. The landlord's own wording is
 * emitted once at the end of the clause, because there is no honest way to
 * translate it and duplicating it would read as a drafting mistake.
 */
export function renderContractSections(terms: ContractTerms): ContractSection[] {
  const language = contractLanguage(terms);
  const flatten = (sections: ContractSection[]): ContractSection[] =>
    sections.map((section) => ({
      heading: section.heading,
      paragraphs: section.note
        ? [...section.paragraphs, section.note]
        : section.paragraphs,
      note: undefined,
    }));

  if (language === "en") return flatten(englishSections(terms));
  if (language === "fil") return flatten(filipinoSections(terms));

  const en = englishSections(terms);
  const fil = filipinoSections(terms);

  // Join on the English list, since it's the one that defines which optional
  // clauses exist: a clause the landlord left blank is blank in both.
  return en.map((section, index) => {
    const match = fil[index];
    const headings = [section.heading];
    const paragraphs = [...section.paragraphs];
    if (match) {
      if (match.heading !== section.heading) headings.push(match.heading);
      paragraphs.push(...match.paragraphs);
    }
    // Once, at the end: the landlord's words are in whatever language they
    // wrote them in.
    if (section.note) paragraphs.push(section.note);
    return { heading: headings.join(" / "), paragraphs };
  });
}

/**
 * The plain-text contract. This exact string is what gets hashed, so it must
 * contain every clause and nothing that varies per viewer — no timestamps, no
 * version-specific wording, and no signature marks (those vary per party and
 * are deliberately not part of what the hash covers).
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
  /** How the signer was identified; null on signatures that predate this. */
  verifiedBy: SignatureVerifiedBy | null;
  verifiedAt: Date | null;
  /** Request evidence, recorded for the day a signature is disputed. */
  ipAddress: string | null;
  userAgent: string | null;
}

function toContractSignature(
  row: typeof leaseSignatures.$inferSelect,
): ContractSignature {
  return {
    role: row.role,
    signerName: row.signerName,
    method: row.method,
    signature: row.signature,
    signedAt: row.signedAt,
    verifiedBy: row.verifiedBy,
    verifiedAt: row.verifiedAt,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
  };
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
  for (const row of rows) byRole[row.role] = toContractSignature(row);
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
  for (const row of rows) byRole[row.role] = toContractSignature(row);
  return byRole;
}

// ---------------------------------------------------------------------------
// The emailed signing link
// ---------------------------------------------------------------------------

/**
 * How long an emailed link stays usable. Long enough that a tenant who
 * misplaces the first email isn't stuck, short enough that a link forwarded to
 * the wrong person eventually dies on its own.
 */
export const CONTRACT_LINK_DAYS = 30;

/**
 * Mint a fresh signing link. The plaintext is returned for the email and never
 * stored; only its sha256 goes on the row, so a database dump can't be used to
 * sign contracts. Every send rotates the token, which means the most recent
 * email is the only live one — the correct behaviour when someone resends
 * because the first never arrived.
 */
export async function issueAccessToken(
  contractId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + CONTRACT_LINK_DAYS * 24 * 60 * 60 * 1000,
  );
  await db
    .update(leaseContracts)
    .set({ accessTokenHash: hashToken(token), accessExpiresAt: expiresAt })
    .where(eq(leaseContracts.id, contractId));
  return { token, expiresAt };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export interface TokenResult {
  contract: ContractRecord;
  /** False once the link has aged out; the document is still readable. */
  linkValid: boolean;
  /** Why the link can't be used, if it can't. */
  problem: "expired" | "superseded" | "voided" | null;
}

/**
 * Resolve an emailed link. A contract that has been superseded or voided is
 * deliberately still *found* — the tenant should be told the truth about what
 * happened rather than shown a broken page — but `problem` marks it as no
 * longer signable.
 */
export async function resolveAccessToken(token: string): Promise<TokenResult | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const [row] = await db
    .select()
    .from(leaseContracts)
    .where(eq(leaseContracts.accessTokenHash, hashToken(token)))
    .limit(1);
  if (!row) return null;

  const contract = toRecord(row);
  const expired =
    row.accessExpiresAt !== null && row.accessExpiresAt.getTime() < Date.now();
  const problem =
    contract.status === "superseded"
      ? "superseded"
      : contract.status === "voided"
        ? "voided"
        : expired
          ? "expired"
          : null;

  return {
    contract,
    linkValid: problem === null,
    problem,
  };
}

/**
 * Send the "you still haven't opened this" nudge, with a freshly issued link.
 *
 * Separate from `deliverContract` because the wording, the subject and the
 * rotation policy all differ: this is a chase rather than an issue, and it
 * rotates the token only on the strength of the caller having filtered to
 * contracts still sitting at `sent`.
 */
export async function deliverContractReminder(row: {
  id: string;
  version: number;
  tenantName: string;
  tenantEmail: string;
  landlordLabel: string;
  propertyLine: string;
  attempt: 1 | 2;
}): Promise<DeliveryOutcome> {
  const { sendContractReminderEmail, appOrigin } = await import("@/lib/email");

  const { token, expiresAt } = await issueAccessToken(row.id);
  const result = await sendContractReminderEmail({
    to: row.tenantEmail,
    tenantName: row.tenantName || "there",
    landlordLabel: row.landlordLabel,
    propertyLine: row.propertyLine,
    contractUrl: `${appOrigin()}/contract/${token}`,
    attempt: row.attempt,
  });

  if (!result.delivered) {
    return {
      ok: false,
      problem: result.reason ?? "The email provider didn't accept the message.",
      loggedOnly: true,
    };
  }

  // A reminder is a send, so it counts as one and refreshes the on-screen
  // "last sent" line rather than contradicting it.
  await recordSend(row.id, { error: null });
  return {
    ok: true,
    problem: null,
    loggedOnly: false,
    linkExpiresAt: expiresAt,
  };
}

/**
 * Record the outcome of a send attempt.
 *
 * `lastSendError` exists because "we emailed it" and "it arrived" are
 * different claims, and the landlord has no way to tell them apart otherwise.
 * A transport that isn't configured, or a recipient the provider refuses, is
 * written here and shown in the UI instead of failing silently.
 */
export async function recordSend(
  contractId: string,
  outcome: { error: string | null },
): Promise<void> {
  await db
    .update(leaseContracts)
    .set({
      lastSentAt: new Date(),
      sendCount: sql`${leaseContracts.sendCount} + 1`,
      lastSendError: outcome.error,
    })
    .where(eq(leaseContracts.id, contractId));
}

/** Set up so a send can be reported honestly; called before the transport runs. */
export async function contractDelivery(contractId: string) {
  const [row] = await db
    .select({
      sendCount: leaseContracts.sendCount,
      lastSentAt: leaseContracts.lastSentAt,
      lastSendError: leaseContracts.lastSendError,
    })
    .from(leaseContracts)
    .where(eq(leaseContracts.id, contractId))
    .limit(1);
  return {
    sendCount: row?.sendCount ?? 0,
    lastSentAt: row?.lastSentAt ?? null,
    lastSendError: row?.lastSendError ?? null,
  };
}

export interface DeliveryOutcome {
  ok: boolean;
  /** Set when the send did not reach anyone — shown verbatim to the landlord. */
  problem: string | null;
  /** True when no transport is configured and the mail was only logged. */
  loggedOnly: boolean;
  /** When the signing link minted for this send expires. */
  linkExpiresAt?: Date;
}

/**
 * Email the contract and mint its signing link, in that order — the link has
 * to exist before the mail that carries it, and a failure to send must not
 * leave the landlord believing a tenant has it.
 *
 * Best-effort by design: a provider outage should not roll back an issued
 * contract, so the failure is recorded and reported rather than thrown.
 */
export async function deliverContract(contractId: string): Promise<DeliveryOutcome> {
  const [row] = await db
    .select({
      id: leaseContracts.id,
      status: leaseContracts.status,
      version: leaseContracts.version,
      terms: leaseContracts.terms,
    })
    .from(leaseContracts)
    .where(eq(leaseContracts.id, contractId))
    .limit(1);
  if (!row) return { ok: false, problem: "That contract could not be found.", loggedOnly: false };

  const terms = parseContractTerms(row.terms);
  const recipient = terms.tenantEmail.trim();
  if (!recipient) {
    await recordSend(contractId, { error: "This tenant has no email address on file." });
    return {
      ok: false,
      problem: "This tenant has no email address on file.",
      loggedOnly: false,
    };
  }

  const { token, expiresAt } = await issueAccessToken(contractId);
  const { sendContractEmail, appOrigin } = await import("@/lib/email");

  const result = await sendContractEmail({
    to: recipient,
    tenantName: terms.tenantName || "there",
    landlordLabel:
      terms.landlordBusinessName.trim() || terms.landlordName.trim() || "Your landlord",
    propertyLine: [terms.propertyName, terms.unitName ? `Unit ${terms.unitName}` : ""]
      .filter(Boolean)
      .join(", "),
    contractUrl: `${appOrigin()}/contract/${token}`,
    linkDays: Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000)),
    version: row.version,
  });

  if (!result.delivered) {
    // "No transport configured" is the local-dev case, not a failure to alarm
    // anyone about — but it still has to be visible, because on a deployed app
    // it means the tenant got nothing.
    const problem =
      result.reason ?? "The email provider didn't accept the message.";
    await recordSend(contractId, { error: problem });
    return { ok: false, problem, loggedOnly: true };
  }

  await recordSend(contractId, { error: null });
  return { ok: true, problem: null, loggedOnly: false };
}

// ---------------------------------------------------------------------------
// Chasing a contract nobody opened
// ---------------------------------------------------------------------------

/** Days after issue at which the first and final chases go out. */
export const CONTRACT_REMINDER_DAYS = [3, 7] as const;

export interface ReminderCandidate {
  id: string;
  version: number;
  issuedAt: Date | null;
  /** 1 for the first chase, 2 for the last. */
  attempt: 1 | 2;
  tenantName: string;
  tenantEmail: string;
  landlordLabel: string;
  propertyLine: string;
}

/**
 * Contracts issued long enough ago that still sit at `sent` and haven't been
 * opened — plus the contracts old enough for the second chase.
 *
 * The `status = 'sent'` filter is doing real work rather than being a
 * shortcut: it means the tenant has provably not looked, so reissuing the
 * signing link costs nothing (their old link was never going to be used), and
 * it means a landlord is never chased about a tenant who already signed.
 */
export async function remindersDue(now = new Date()): Promise<ReminderCandidate[]> {
  const out: ReminderCandidate[] = [];

  for (const attempt of [1, 2] as const) {
    const cutoff = new Date(
      now.getTime() - CONTRACT_REMINDER_DAYS[attempt - 1] * 24 * 60 * 60 * 1000,
    );
    const stamp =
      attempt === 1
        ? leaseContracts.firstReminderSentAt
        : leaseContracts.secondReminderSentAt;

    const rows = await db
      .select({
        id: leaseContracts.id,
        version: leaseContracts.version,
        issuedAt: leaseContracts.issuedAt,
        terms: leaseContracts.terms,
      })
      .from(leaseContracts)
      .where(
        and(
          eq(leaseContracts.status, "sent"),
          isNotNull(leaseContracts.issuedAt),
          // Only contracts old enough for *this* chase. The 7-day cut-off is
          // deliberately not checked against the 3-day stamp: a contract that
          // was issued 10 days ago has passed both, and needs both chases.
          lte(leaseContracts.issuedAt, cutoff),
          isNull(stamp),
        ),
      );

    for (const row of rows) {
      const terms = parseContractTerms(row.terms);
      if (!terms.tenantEmail.trim()) continue;
      out.push({
        id: row.id,
        version: row.version,
        issuedAt: row.issuedAt,
        attempt,
        tenantName: terms.tenantName,
        tenantEmail: terms.tenantEmail,
        landlordLabel:
          terms.landlordBusinessName.trim() || terms.landlordName.trim() || "Your landlord",
        propertyLine: [terms.propertyName, terms.unitName ? `Unit ${terms.unitName}` : ""]
          .filter(Boolean)
          .join(", "),
      });
    }
  }

  return out;
}

/** Stamp one chase as sent, so it never goes out twice. */
export async function markReminderSent(
  contractId: string,
  attempt: 1 | 2,
): Promise<void> {
  const now = new Date();
  if (attempt === 1) {
    await db
      .update(leaseContracts)
      .set({ firstReminderSentAt: now })
      .where(eq(leaseContracts.id, contractId));
  } else {
    await db
      .update(leaseContracts)
      .set({ secondReminderSentAt: now })
      .where(eq(leaseContracts.id, contractId));
  }
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
  /**
   * Required: a signature without a statement of how the signer was
   * identified is the thing this field exists to stop. Callers pass either
   * `accountVerification()` or the result of a spent email code.
   */
  verification: SignatureVerification;
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
      verifiedBy: input.verification.verifiedBy,
      verifiedAt: input.verification.verifiedAt,
      ipAddress: input.verification.ipAddress,
      userAgent: input.verification.userAgent,
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
        verifiedBy: input.verification.verifiedBy,
        verifiedAt: input.verification.verifiedAt,
        ipAddress: input.verification.ipAddress,
        userAgent: input.verification.userAgent,
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
      landlordBusinessName: portfolios.businessName,
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
    // A snapshot drafted now renders with the current party wording.
    renderVersion: CURRENT_CONTRACT_RENDER_VERSION,
    landlordName: row.landlordName ?? "",
    landlordBusinessName: row.landlordBusinessName ?? "",
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