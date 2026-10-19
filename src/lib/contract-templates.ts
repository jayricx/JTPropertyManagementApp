/**
 * Contract template data: the Filipino prose and the clause presets.
 *
 * Kept as pure data with no dependency on `ContractTerms` so the renderer in
 * `contracts.ts` can depend on *this* without a cycle. Nothing here is a
 * default that reaches the contract by accident — a preset seeds fields the
 * landlord can rewrite before sending, and nothing is applied to a contract
 * that has already been issued.
 *
 * A note on the language. Philippines tenancy practice is overwhelmingly in
 * English, but a large share of boarders and family-lease tenants read it
 * poorly, and a document someone cannot read is one they cannot meaningfully
 * agree to. Bilingual is offered alongside the single-language versions
 * because that is what a lawyer here would produce: each clause shown in both,
 * with the two kept adjacent so they can never be read as separate terms.
 *
 * Nothing in here is legal advice. Deposit, penalty and termination wording is
 * deliberately left to the landlord, and every document says so.
 */

export type ContractLanguage = "en" | "fil" | "both";

export const contractLanguages: ContractLanguage[] = ["en", "fil", "both"];

export const contractLanguageLabels: Record<ContractLanguage, string> = {
  en: "English",
  fil: "Filipino",
  both: "Bilingual (both)",
};

export const contractLanguageDescriptions: Record<ContractLanguage, string> = {
  en: "What most PH leases use. Readable by almost everyone.",
  fil: "For tenants who read English poorly. Much of what most contracts are disputed over lives in these clauses.",
  both: "Each clause in both languages, side by side. The safest choice, and the longest document.",
};

/** Filipino month names, for "1 Marso 2026". Deterministic, like the English ones. */
export const FILIPINO_MONTHS = [
  "Enero", "Pebrero", "Marso", "Abril", "Mayo", "Hunyo",
  "Hulyo", "Agosto", "Setyembre", "Oktubre", "Nobyembre", "Disyembre",
];

export const filipinoHeading: Record<string, string> = {
  "The parties": "Ang mga parties",
  "The premises": "Ang paksa",
  "The term": "Ang panahon",
  "Rent": "Ang upat",
  "Security deposit": "Ang security deposit",
  "Utilities and other charges": "Mga utility at iba pang bayarin",
  "Late payment": "Huling pagbabayad",
  "Repairs and maintenance": "Pagkukumpuni at pagpapanatili",
  "Termination and move-out": "Pagtatapos ng kasunduan at paglikas",
  "House rules": "Mga patakaran ng bahay",
  "Additional terms": "Karagdagang kasunduan",
};

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export type ContractPresetId = "residential" | "bedspace" | "commercial";

export interface ContractPreset {
  id: ContractPresetId;
  label: string;
  blurb: string;
  /** Optional-clause fields this preset leads with, in order. */
  fields: Array<
    | "utilitiesNote"
    | "depositTerms"
    | "lateFeeNote"
    | "houseRules"
    | "repairsNote"
    | "terminationNote"
    | "additionalTerms"
  >;
  /** Seed text, always editable. Written in both languages. */
  defaults: Record<string, { en: string; fil: string }>;
}

const lines = (values: string[]) => values.join("\n");

export const CONTRACT_PRESETS: ContractPreset[] = [
  {
    id: "residential",
    label: "Residential unit",
    blurb:
      "A whole home rented to one household. The usual starting point for an apartment, house or condo unit.",
    fields: [
      "utilitiesNote",
      "depositTerms",
      "repairsNote",
      "terminationNote",
      "houseRules",
    ],
    defaults: {
      utilitiesNote: {
        en: lines([
          "Electricity and water are sub-metered. The Lessee pays for their own consumption.",
          "Internet is included in the monthly rent.",
          "Any amount the Lessor pays on the Lessee's behalf is due within seven (7) days of being billed.",
        ]),
        fil: lines([
          "Ang kuryente at tubig ay may sariling sub-meter. Ang Lessee ang nagbabayad sa sarili nitong konsumo.",
          "Kasama na sa buwaning upat ang internet.",
          "Bawat halagang binayaran ng Lessor para sa Lessee ay dapat bayaran sa loob ng pitong (7) araw mula sa pagpapadala ng bill.",
        ]),
      },
      depositTerms: {
        en: "The deposit is refunded within thirty (30) days of move-out, less the cost of repairs beyond normal wear and tear, and less any unpaid rent or utility charges.",
        fil: "Ang deposito ay ibabalik sa loob ng tatlumpung (30) araw mula sa paglikas, minus ang gastos ng mga kalkal na lampas sa normal na pagkasira, at minus ang anumang hindi pa bayad na upat o utility.",
      },
      repairsNote: {
        en: lines([
          "Repairs to the unit itself are the Lessor's responsibility.",
          "The Lessee reports damage or loss through the portal as soon as it happens, so it can be dealt with promptly.",
        ]),
        fil: lines([
          "Ang mga kalkal sa mismong yunit ay responsibilidad ng Lessor.",
          "Awtomatikong iuulat ng Lessee ang anumang pinsala o pagkalugi sa portal sa lalong madaling panahon.",
        ]),
      },
      terminationNote: {
        en: "Either party may end this agreement by giving thirty (30) days' written notice. The deposit is returned after the unit is handed back and inspected.",
        fil: "Alinman sa dalawang parties ay maaaring magtapos sa kasunduang ito sa pamamagitan ng 30 araw na nakasulat na abiso. Ibaabalik ang deposito pagkatapos na iulat ang yunit at masuri ito.",
      },
      houseRules: {
        en: lines([
          "Quiet hours are 10:00 PM to 7:00 AM.",
          "No parties or loud gatherings without the Lessor's prior written consent.",
          "Keep the unit clean and dispose of rubbish on collection day only.",
        ]),
        fil: lines([
          "Tahimik na oras mula 10:00 ng gabi hanggang 7:00 ng umaga.",
          "Walang party o malakas na pag-iingat nang walang nakasulat na pahintulot mula sa Lessor.",
          "Panatilihing malinis ang yunit at ilabas ang basura tuwing araw ng pagkolekta lamang.",
        ]),
      },
    },
  },
  {
    id: "bedspace",
    label: "Bedspace / boarding",
    blurb:
      "A bed and access to shared areas rather than a whole unit. The clauses that usually matter here are the common areas, belongings and cooking.",
    fields: [
      "utilitiesNote",
      "depositTerms",
      "houseRules",
      "repairsNote",
      "terminationNote",
      "additionalTerms",
    ],
    defaults: {
      utilitiesNote: {
        en: lines([
          "Electricity and water are shared and are divided equally between the occupants of each floor.",
          "Wi-Fi is included in the monthly payment.",
          "Each occupant is responsible for their own consumption over and above their equal share.",
        ]),
        fil: lines([
          "Ang kuryente at tubig ay pinaghahati nang pantay-pantay sa mga nasa parehong palapag.",
          "Kasama na sa buwaning bayad ang Wi-Fi.",
          "Sagot ng bawat nang tumatira ang sarili nitong konseso sa itaas ng karaniwang bahagi nila.",
        ]),
      },
      depositTerms: {
        en: "The deposit is refunded within thirty (30) days of move-out, less the cost of replacing beddings or linens left unsanitised, and less any unpaid charges.",
        fil: "Ang deposito ay ibabalik sa loob ng tatlumpung (30) araw mula sa paglikas, minus ang halagang kapalit ng kama o kumot na hindi na nalilinis, at minus ang anumang hindi pa bayad na bayarin.",
      },
      houseRules: {
        en: lines([
          "The bed space rented is for one person only.",
          "The Lessee may keep personal belongings only inside the assigned bed space, not in the common areas.",
          "Common areas are quiet hours from 10:00 PM to 7:00 AM.",
          "Cooking is allowed only in the designated kitchen, and the Lessee cleans up after use.",
          "Visitors are welcome during daytime only, and must be signed in at the entrance.",
          "No sleeping guests overnight without the Lessor's written consent.",
          "Alcohol and illegal substances are not allowed on the premises.",
        ]),
        fil: lines([
          "Ang kinukuhang espasyo ng kama ay para sa iisang tao lamang.",
          "Ang mga personal na bagay ng Lessee ay dapat nasa italin na kama lamang, hindi sa mga karaniwang lugar.",
          "Tahimik na oras sa mga karaniwang lugar mula 10:00 ng gabi hanggang 7:00 ng umaga.",
          "May pagluto lamang sa itinalagang kusina, at dapat linisin ng Lessee pagkatapos gamitin.",
          "Biyaya ang mga bisita sa araw lamang, at dapat magpatala sa pasukan.",
          "Walang tulog na panauhin na magmomuni nang walang nakasulat na pahintulot mula sa Lessor.",
          "Hindi pinapayagan ang alak at mga illegal na substance sa loob ng premises.",
        ]),
      },
      repairsNote: {
        en: "Repairs to common areas and the building's utilities are the Lessor's responsibility. The Lessee is responsible for damage they cause.",
        fil: "Ang mga kalkal sa mga karaniwang lugar at sa mga utility ng gusali ay responsibilidad ng Lessor. Ang Lessor ang mananagot sa pinsalang idinulot ng Lessee.",
      },
      terminationNote: {
        en: "This agreement may be ended by either party with fifteen (15) days' notice. The Lessor may end it immediately for repeated Rule 7 breaches, unpaid charges, or damage to the premises.",
        fil: "Maaaring tapusin ang kasunduang ito ng alinman sa dalawang parties kapag may 15 araw na abiso. Maaaring itapos agad ng Lessor sa paulit-ulit na paglabag sa Patakaran 7, hindi pagbabayad, o pinsala sa premises.",
      },
      additionalTerms: {
        en: "The Lessor provides the bed frame, mattress and basic storage. Linens are not provided.",
        fil: "Ang Lessor ang nagbibigay ng kama, kuton at simpleng istante. Hindi kasama ang mga kumot at balda.",
      },
    },
  },
  {
    id: "commercial",
    label: "Commercial space",
    blurb:
      "A shop, office or stall. What matters is what the space may be used for, signage, fit-out and operating hours.",
    fields: [
      "utilitiesNote",
      "depositTerms",
      "lateFeeNote",
      "repairsNote",
      "additionalTerms",
      "terminationNote",
    ],
    defaults: {
      utilitiesNote: {
        en: lines([
          "Electricity and water are metered separately and billed to the Lessee with the rent.",
          "The Lessor covers common-area maintenance and the building's structural repairs.",
        ]),
        fil: lines([
          "Hiwalay na sukat ang kuryente at tubig, at kasama ito sa bayarin kasama ang upat.",
          "Ang Lessor ang bahala sa maintenance ng mga karaniwang lugar at sa mga kalkal ng gusali mismo.",
        ]),
      },
      depositTerms: {
        en: "The deposit is refunded within thirty (30) days of handover, less the cost of restoring the space to its original condition, and less unpaid rent, utilities and association dues.",
        fil: "Ang deposito ay ibabalik sa loob ng tatlumpung (30) araw mula sa paghatol, minus ang gastos ng pagbabalik sa dating anyo ng espasyo, at minus ang hindi pa bayad na upat, utility at dues ng homeowners association.",
      },
      lateFeeNote: {
        en: "Rent unpaid after the agreed due date is subject to a charge of ten percent (10%) per month or fraction of a month, without prejudice to the Lessor's right to terminate for non-payment.",
        fil: "Ang hindi bayad na upat pagkatapos ng inyong petsa ng due ay saklaw ng singkung (10%) na singil bawat buwan o bahagi ng buwan, nang hindi rin nagpapawalang-bisa sa karapatan ng Lessor na magtapos sa kasunduan dahil sa hindi pagbabayad.",
      },
      repairsNote: {
        en: lines([
          "Structural repairs and the building's common facilities are the Lessor's responsibility.",
          "The Lessee is responsible for the space's interior, including the air-conditioning units, and for any signage they install.",
        ]),
        fil: lines([
          "Ang mga pangunahing kalkal at karaniwang pasilidad ng gusali ay responsibilidad ng Lessor.",
          "Ang Lessee ang mananagot sa loob ng espasyo, kasama ang mga aircon, at sa anumang signage na ipinaglagay nila.",
        ]),
      },
      additionalTerms: {
        en: lines([
          "The space may be used only for the business described in the Lessee's application; any other use requires the Lessor's written consent.",
          "The Lessee handles its own signage, subject to the building's rules, and removes it on move-out.",
          "Fit-out and any structural work require the Lessor's written approval in advance.",
          "The Lessee holds whatever permits its business legally requires, and indemnifies the Lessor against claims arising from its operation.",
        ]),
        fil: lines([
          "Ang espasyo ay gagamitin lamang sa negosyong nakasaad sa aplikasyon ng Lessee; kahit anong ibang gamit ay nangangailangan ng nakasulat na pahintulot ng Lessor.",
          "Bahala ang Lessee sa sariling signage nang may paggalang sa mga patakaran ng gusali, at alisin ito sa paglikas.",
          "Kailangan ng nakasulat na pag-apruba ng Lessor bago pa magsimula ang mga gawaing fit-out at mga pangunahing pagkukumpuni.",
          "Ang Lessee ang may hawak ng mga permit na kailangan ng kaniyang negosyo, at mananagot sa mga claim na mula sa kaniyang operasyon.",
        ]),
      },
      terminationNote: {
        en: "This agreement may be ended by either party with sixty (60) days' written notice, given before the end of the rental month.",
        fil: "Maaaring tapusin ang kasunduang ito ng alinman sa dalawang parties sa pamamagitan ng 60 araw na nakasulat na abiso, na ibinibigay bago matapos ang buwan ng pagliliwat.",
      },
    },
  },
];

export function contractPreset(id: ContractPresetId): ContractPreset {
  const found = CONTRACT_PRESETS.find((p) => p.id === id);
  return found ?? CONTRACT_PRESETS[0];
}

/**
 * Seed text for a preset, for one language.
 *
 * For `both`, a bilingual default keeps each language internally complete and
 * reads far better than an English block followed by a Filipino one — the
 * landlord can rewrite either without the other becoming nonsense.
 */
export function presetDefaults(
  preset: ContractPreset,
  language: ContractLanguage,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, text] of Object.entries(preset.defaults)) {
    if (language === "fil") out[field] = text.fil;
    else if (language === "both") out[field] = `${text.en}\n\n${text.fil}`;
    else out[field] = text.en;
  }
  return out;
}