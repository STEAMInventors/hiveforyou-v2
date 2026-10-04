import type { IntakePackLogicalDocument } from "@hiveforyou/domain-pack";

/** Map pack classification to Discover catalog documentType strings for completeness. */
export function iepCatalogDocumentType(doc: IntakePackLogicalDocument): string {
  const subtype = doc.documentSubtype;
  if (subtype === "referral") return "Referral for Special Education Evaluation";
  if (subtype === "parent_evaluation_consent")
    return "Parent Consent for Initial Special Education Evaluation";
  if (subtype === "evaluation_plan") return "Special Education Evaluation Plan";
  if (subtype === "academic_evaluation") return "Academic Evaluation Report";
  if (subtype === "psychoeducational_evaluation") return "Psychoeducational evaluation";
  if (subtype === "speech_language_evaluation") return "Speech-language evaluation";
  if (subtype === "eligibility_determination") return "Eligibility Determination";
  if (doc.documentFamily === "IEP") return "Individualized Education Program";
  if (subtype === "progress_report") return "Progress report";
  return doc.customerLabel;
}
