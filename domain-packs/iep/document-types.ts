import type { DocumentDiscoveryGroup } from "@hiveforyou/shared/discovery";
import type { DiscoverCatalogEntry } from "@hiveforyou/domain-pack";

/**
 * Canonical document types in the IEP Engine 1 qualification corpus (L001).
 * Discover vocabulary must include each type so validated proposals can name
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

export const IEP_DISCOVER_GROUPS: DocumentDiscoveryGroup[] = [
  {
    id: "evaluations",
    label: "Evaluations",
    description: "Assessments that inform eligibility and planning",
    sequenceOrder: 1,
  },
  {
    id: "planning",
    label: "Planning & meetings",
    description: "Agreements about services and supports",
    sequenceOrder: 2,
  },
  {
    id: "progress",
    label: "Progress & updates",
    description: "Reports on implementation over time",
    sequenceOrder: 3,
    defaultCollapsed: false,
  },
];

export const IEP_DISCOVER_CATALOG: DiscoverCatalogEntry[] = [
  {
    catalogId: "referral-special-ed-eval",
    documentType: "Referral for Special Education Evaluation",
    title: "Referral for special education evaluation",
    familyRole: "Referral",
    groupId: "evaluations",
    sequenceOrder: 1,
    filenameHints: [],
  },
  {
    catalogId: "parent-consent-initial-eval",
    documentType: "Parent Consent for Initial Special Education Evaluation",
    title: "Parent consent for initial special education evaluation",
    familyRole: "Consent form",
    groupId: "evaluations",
    sequenceOrder: 2,
    filenameHints: [],
  },
  {
    catalogId: "special-ed-eval-plan",
    documentType: "Special Education Evaluation Plan",
    title: "Special education evaluation plan",
    familyRole: "Evaluation plan",
    groupId: "evaluations",
    sequenceOrder: 3,
    filenameHints: [],
  },
  {
    catalogId: "academic-eval-report",
    documentType: "Academic Evaluation Report",
    title: "Academic evaluation report",
    familyRole: "Evaluation report",
    groupId: "evaluations",
    sequenceOrder: 4,
    filenameHints: [],
  },
  {
    catalogId: "psycho-eval",
    documentType: "Psychoeducational evaluation",
    title: "Psychoeducational evaluation report",
    familyRole: "Evaluation report",
    groupId: "evaluations",
    sequenceOrder: 5,
    filenameHints: ["eval", "psycho", "assessment", "wisc"],
    defaultDate: "2023-09-12",
  },
  {
    catalogId: "speech-eval",
    documentType: "Speech-language evaluation",
    title: "Speech-language evaluation report",
    familyRole: "Evaluation report",
    groupId: "evaluations",
    sequenceOrder: 6,
    filenameHints: ["speech", "language", "slp", "celf"],
    defaultDate: "2023-10-03",
  },
  {
    catalogId: "eligibility-determination",
    documentType: "Eligibility Determination",
    title: "Eligibility determination",
    familyRole: "Eligibility determination",
    groupId: "evaluations",
    sequenceOrder: 7,
    filenameHints: [],
  },
  {
    catalogId: "iep",
    documentType: "Individualized Education Program",
    title: "Individualized Education Program (IEP)",
    familyRole: "Service plan",
    groupId: "planning",
    sequenceOrder: 1,
    filenameHints: ["iep"],
    defaultDate: "2024-03-15",
  },
  {
    catalogId: "progress-report",
    documentType: "Progress report",
    title: "Progress report",
    familyRole: "Progress update",
    groupId: "progress",
    sequenceOrder: 1,
    filenameHints: ["progress", "report card", "quarterly"],
    defaultDate: "2024-06-01",
  },
];

export const IEP_DOCUMENT_TYPES = [
  ...new Set(IEP_DISCOVER_CATALOG.map((entry) => entry.documentType)),
  "Document (unclassified)",
];

export const IEP_FAMILY_ROLES = [
  ...new Set([
    ...IEP_DISCOVER_CATALOG.map((entry) => entry.familyRole),
    "Uploaded file",
    "Meeting notice",
    "Progress update",
  ]),
];
