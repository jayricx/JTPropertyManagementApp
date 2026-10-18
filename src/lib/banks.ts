/**
 * Major Philippine banks offered when a landlord adds a bank account for the
 * tenant portal's bank-transfer pay-rent flow. Choosing "Other" lets them
 * type any bank we haven't listed (rural banks, cooperatives, OFW accounts)
 * by name instead.
 */
export interface BankOption {
  code: string;
  name: string;
}

export const PHILIPPINE_BANKS: BankOption[] = [
  { code: "bdo", name: "BDO Unibank" },
  { code: "bpi", name: "Bank of the Philippine Islands (BPI)" },
  { code: "metrobank", name: "Metropolitan Bank & Trust (Metrobank)" },
  { code: "landbank", name: "Landbank of the Philippines" },
  { code: "pnb", name: "Philippine National Bank (PNB)" },
  { code: "security_bank", name: "Security Bank" },
  { code: "china_bank", name: "China Banking Corporation" },
  { code: "rcbc", name: "Rizal Commercial Banking Corp. (RCBC)" },
  { code: "unionbank", name: "UnionBank of the Philippines" },
  { code: "eastwest", name: "EastWest Banking Corporation" },
  { code: "robinsons_bank", name: "Robinsons Bank" },
  { code: "maya_bank", name: "Maya Bank" },
  { code: "cimb_bank", name: "CIMB Bank PH" },
  { code: "tonik", name: "Tonik Digital Bank" },
  { code: "gotyme", name: "GoTyme Bank" },
];

/** Sentinel shown in the dropdown for "type the bank name yourself". */
export const OTHER_BANK_CODE = "other";

/** True when `code` names a bank in the catalog (or the Other sentinel). */
export function isKnownBankCode(code: string): boolean {
  return code === OTHER_BANK_CODE || PHILIPPINE_BANKS.some((b) => b.code === code);
}

/**
 * The display name to store for a saved account: the catalog name for a
 * known bank, or the landlord's own text for `other` — so the tenant always
 * sees a plain bank name regardless of how the account was entered.
 */
export function bankDisplayName(bankCode: string, otherBankName: string): string {
  return (
    PHILIPPINE_BANKS.find((b) => b.code === bankCode)?.name ??
    otherBankName.trim() ??
    ""
  );
}
