/**
 * Canonical document types in the IEP Engine 1 qualification corpus (L001).
 * Discover Pack vocabulary must include each type so validated proposals can name
 * uploaded L001 documents without falling back to Document (unclassified).
 */
export const IEP_L001_CORPUS_DOCUMENT_TYPES = [
  "Referral for Special Education Evaluation",
  "Parent Consent for Initial Special Education Evaluation",
  "Special Education Evaluation Plan",
  "Academic Evaluation Report",
  "Psychoeducational evaluation",
  "Speech-language evaluation",
  "Eligibility Determination",
  "Individualized Education Program",
  "Progress report",
] as const;

export type IepL001CorpusDocumentType = (typeof IEP_L001_CORPUS_DOCUMENT_TYPES)[number];
