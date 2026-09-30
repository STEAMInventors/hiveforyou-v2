import type {
  DocumentDiscoveryGroup,
  MissingExpectedDocument,
} from "@hiveforyou/shared/discovery";
import type { PackExpectationRequirementClass } from "@hiveforyou/shared/discover";

import { IEP_AUDIENCE_ROLES, type DomainPackAudienceRole } from "./audience-role-catalog";

export type DiscoverCatalogEntry = {
  catalogId: string;
  documentType: string;
  title: string;
  familyRole: string;
  groupId: string;
  sequenceOrder: number;
  filenameHints: string[];
  defaultDate?: string;
};

export type DiscoverMissingExpectation = MissingExpectedDocument & {
  packExpectationId: string;
  requirementClass: PackExpectationRequirementClass;
};

export type DiscoverDomainPackSnapshot = {
  domainId: string;
  domainPackId: string;
  domainPackVersion: string;
  domainLabel: string;
  groups: DocumentDiscoveryGroup[];
  documentTypes: string[];
  familyRoles: string[];
  relationshipKinds: Array<"precedes" | "supports" | "same_sequence" | "related">;
  catalog: DiscoverCatalogEntry[];
  missingExpectations: DiscoverMissingExpectation[];
  /** Optional sharing-question roles. Omitted packs use the generic fallback after resolution. */
  audienceRoles?: DomainPackAudienceRole[];
};

const IEP_GROUPS: DocumentDiscoveryGroup[] = [
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

const IEP_MISSING: DiscoverMissingExpectation[] = [
  {
    id: "missing-pwn",
    packExpectationId: "iep-expect-pwn",
    requirementClass: "EXPECTED",
    expectedDocumentType: "Prior Written Notice",
    familyRole: "Meeting notice",
    groupId: "planning",
    reasonExpected:
      "This document type usually accompanies major special education decisions in the sequence for this domain.",
    sequenceOrder: 2,
  },
  {
    id: "missing-progress-2023",
    packExpectationId: "iep-expect-progress-prior-year",
    requirementClass: "EXPECTED",
    expectedDocumentType: "Annual progress report (prior school year)",
    familyRole: "Progress update",
    groupId: "progress",
    reasonExpected: "Expected based on the document sequence you provided.",
    sequenceOrder: 0,
  },
];

const IEP_CATALOG: DiscoverCatalogEntry[] = [
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

const IEP_DOCUMENT_TYPES = [
  ...new Set(IEP_CATALOG.map((entry) => entry.documentType)),
  "Document (unclassified)",
];

const IEP_FAMILY_ROLES = [
  ...new Set([
    ...IEP_CATALOG.map((entry) => entry.familyRole),
    "Uploaded file",
    "Meeting notice",
    "Progress update",
  ]),
];

export const IEP_DISCOVER_PACK: DiscoverDomainPackSnapshot = {
  domainId: "iep",
  domainPackId: "hive.domain.iep",
  domainPackVersion: "0.0.0-scaffold",
  domainLabel: "Special education records",
  groups: IEP_GROUPS,
  documentTypes: IEP_DOCUMENT_TYPES,
  familyRoles: IEP_FAMILY_ROLES,
  relationshipKinds: ["precedes", "supports", "same_sequence", "related"],
  catalog: IEP_CATALOG,
  missingExpectations: IEP_MISSING,
  audienceRoles: [...IEP_AUDIENCE_ROLES],
};

const GENERIC_DOCUMENT_TYPES = ["Document (unclassified)"];
const GENERIC_FAMILY_ROLES = ["Uploaded file"];
const GENERIC_GROUPS: DocumentDiscoveryGroup[] = [
  {
    id: "uploads",
    label: "Uploaded documents",
    description: "Documents recognized in this domain",
    sequenceOrder: 1,
  },
];

export const BANKRUPTCY_DISCOVER_PACK: DiscoverDomainPackSnapshot = {
  domainId: "bankruptcy",
  domainPackId: "hive.domain.bankruptcy",
  domainPackVersion: "0.0.0-scaffold",
  domainLabel: "Bankruptcy",
  groups: GENERIC_GROUPS,
  documentTypes: [...GENERIC_DOCUMENT_TYPES, "Petition", "Schedule", "Court filing"],
  familyRoles: [...GENERIC_FAMILY_ROLES, "Court filing", "Financial schedule"],
  relationshipKinds: ["precedes", "supports", "same_sequence", "related"],
  catalog: [],
  missingExpectations: [],
};

export const MEDICAID_DISCOVER_PACK: DiscoverDomainPackSnapshot = {
  domainId: "medicaid",
  domainPackId: "hive.domain.medicaid",
  domainPackVersion: "0.0.0-scaffold",
  domainLabel: "Medicaid",
  groups: GENERIC_GROUPS,
  documentTypes: [...GENERIC_DOCUMENT_TYPES, "Eligibility notice", "Benefits letter"],
  familyRoles: [...GENERIC_FAMILY_ROLES, "Agency notice"],
  relationshipKinds: ["precedes", "supports", "same_sequence", "related"],
  catalog: [],
  missingExpectations: [],
};

const ALL_DISCOVER_PACKS: DiscoverDomainPackSnapshot[] = [
  IEP_DISCOVER_PACK,
  BANKRUPTCY_DISCOVER_PACK,
  MEDICAID_DISCOVER_PACK,
];

export function listDiscoverDomainPacks(): DiscoverDomainPackSnapshot[] {
  return ALL_DISCOVER_PACKS.map((pack) => structuredClone(pack));
}

export function getDiscoverPackByDomainLabel(
  domainLabel: string,
): DiscoverDomainPackSnapshot | null {
  const normalized = domainLabel.trim().toLowerCase();
  return (
    ALL_DISCOVER_PACKS.find(
      (pack) => pack.domainLabel.trim().toLowerCase() === normalized,
    ) ?? null
  );
}

export function getDiscoverPackByDomainId(
  domainId: string,
): DiscoverDomainPackSnapshot | null {
  return ALL_DISCOVER_PACKS.find((pack) => pack.domainId === domainId) ?? null;
}

/** Registered pack, or an empty scaffold so a proposed domain is not dropped. */
export function discoverPackForDomain(
  domainId: string,
  domainLabel?: string,
): DiscoverDomainPackSnapshot {
  const registered = getDiscoverPackByDomainId(domainId);
  if (registered) {
    return registered;
  }
  const id = domainId.trim() || "unregistered";
  return {
    domainId: id,
    domainPackId: "hive.domain.unregistered",
    domainPackVersion: "none",
    domainLabel: domainLabel?.trim() || id,
    groups: structuredClone(GENERIC_GROUPS),
    documentTypes: [...GENERIC_DOCUMENT_TYPES],
    familyRoles: [...GENERIC_FAMILY_ROLES],
    relationshipKinds: ["precedes", "supports", "same_sequence", "related"],
    catalog: [],
    missingExpectations: [],
  };
}
