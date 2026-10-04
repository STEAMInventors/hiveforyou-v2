import type {
  DocumentDiscoveryGroup,
  DocumentDiscoveryRelationship,
  MissingExpectedDocument,
} from "./types";

/** Static Engine 1-shaped template — no case intelligence. Replace with API response later. */

export const DISCOVERY_DOMAIN_LABEL = "Special education records";

export const DISCOVERY_TEMPLATE_GROUPS: DocumentDiscoveryGroup[] = [
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

export const DISCOVERY_TEMPLATE_MISSING: MissingExpectedDocument[] = [
  {
    id: "missing-pwn",
    expectedDocumentType: "Prior Written Notice",
    familyRole: "Meeting notice",
    groupId: "planning",
    reasonExpected:
      "This document type usually accompanies major special education decisions in the sequence for this domain.",
    sequenceOrder: 2,
  },
  {
    id: "missing-progress-2023",
    expectedDocumentType: "Annual progress report (prior school year)",
    familyRole: "Progress update",
    groupId: "progress",
    reasonExpected:
      "Expected based on the document sequence you provided.",
    sequenceOrder: 0,
  },
];

type CatalogEntry = {
  catalogId: string;
  documentType: string;
  title: string;
  familyRole: string;
  groupId: string;
  sequenceOrder: number;
  filenameHints: RegExp[];
  defaultDate?: string;
};

export const DISCOVERY_DOCUMENT_CATALOG: CatalogEntry[] = [
  {
    catalogId: "psycho-eval",
    documentType: "Psychoeducational evaluation",
    title: "Psychoeducational evaluation report",
    familyRole: "Evaluation report",
    groupId: "evaluations",
    sequenceOrder: 1,
    filenameHints: [/eval/i, /psycho/i, /assessment/i, /wisc/i],
    defaultDate: "2023-09-12",
  },
  {
    catalogId: "speech-eval",
    documentType: "Speech-language evaluation",
    title: "Speech-language evaluation report",
    familyRole: "Evaluation report",
    groupId: "evaluations",
    sequenceOrder: 2,
    filenameHints: [/speech/i, /language/i, /slp/i, /celf/i],
    defaultDate: "2023-09-18",
  },
  {
    catalogId: "iep",
    documentType: "Individualized Education Program",
    title: "IEP document",
    familyRole: "Service plan",
    groupId: "planning",
    sequenceOrder: 1,
    filenameHints: [/iep/i, /individualized/i],
    defaultDate: "2024-03-04",
  },
  {
    catalogId: "meeting-notes",
    documentType: "IEP meeting notes",
    title: "IEP team meeting notes",
    familyRole: "Meeting record",
    groupId: "planning",
    sequenceOrder: 2,
    filenameHints: [/meeting/i, /minutes/i, /team/i],
    defaultDate: "2024-03-04",
  },
  {
    catalogId: "progress",
    documentType: "Progress report",
    title: "Annual progress report",
    familyRole: "Progress update",
    groupId: "progress",
    sequenceOrder: 1,
    filenameHints: [/progress/i, /report/i, /update/i],
    defaultDate: "2024-11-01",
  },
  {
    catalogId: "consent",
    documentType: "Evaluation consent",
    title: "Consent for evaluation",
    familyRole: "Consent form",
    groupId: "evaluations",
    sequenceOrder: 0,
    filenameHints: [/consent/i],
    defaultDate: "2023-08-20",
  },
];

export function buildTemplateRelationships(
  documentIdsByCatalogId: Map<string, string>,
): DocumentDiscoveryRelationship[] {
  const rel = (
    fromKey: string,
    toKey: string,
    kind: DocumentDiscoveryRelationship["kind"],
    label?: string,
  ): DocumentDiscoveryRelationship | null => {
    const fromDocumentId = documentIdsByCatalogId.get(fromKey);
    const toDocumentId = documentIdsByCatalogId.get(toKey);
    if (!fromDocumentId || !toDocumentId) {
      return null;
    }
    return {
      id: `${fromKey}-${toKey}-${kind}`,
      fromDocumentId,
      toDocumentId,
      kind,
      label,
    };
  };

  return [
    rel("consent", "psycho-eval", "precedes", "Before evaluation"),
    rel("psycho-eval", "iep", "precedes", "Informs plan"),
    rel("speech-eval", "iep", "supports", "Related evaluation"),
    rel("iep", "progress", "precedes", "Tracks plan"),
    rel("meeting-notes", "iep", "same_sequence", "Same meeting cycle"),
  ].filter((r): r is DocumentDiscoveryRelationship => r !== null);
}
