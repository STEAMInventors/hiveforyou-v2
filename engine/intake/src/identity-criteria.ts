import { DOCUMENT_IDENTITY_TYPES, type DocumentIdentityType } from "@hiveforyou/shared/intake";

/** What the document is. These descriptions are not case or domain assignment. */
export const DOCUMENT_IDENTITY_CRITERIA: Record<DocumentIdentityType, string> = {
  bank_statement: "A statement of account activity from a bank or credit union.",
  tax_return: "A filed or prepared tax return, such as a Form 1040.",
  pay_stub: "A statement of wages for a pay period.",
  bankruptcy_filing: "A bankruptcy petition or related court filing form.",
  medicaid_document: "A Medicaid application, notice, or benefits document.",
  iep_document: "An individualized education program or special education evaluation or plan.",
  insurance_document: "An insurance policy, card, explanation of benefits, or claim.",
  certificate: "A certificate, license, or formal credential.",
  other: "A document that is none of the above.",
};

export const DOCUMENT_IDENTITY_INSTRUCTIONS =
  "Identify what this document actually is based only on the document itself.";

export function assertIdentityCriteriaComplete(): void {
  for (const type of DOCUMENT_IDENTITY_TYPES) {
    if (!DOCUMENT_IDENTITY_CRITERIA[type]) {
      throw new Error(`Missing identity criteria for ${type}.`);
    }
  }
}
