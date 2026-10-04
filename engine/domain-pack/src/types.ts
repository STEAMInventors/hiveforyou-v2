import type { DomainPackVocabularySnapshot } from "@hiveforyou/shared/canonical-study";
import type { PackExpectationRequirementClass } from "@hiveforyou/shared/discover";
import type { DocumentDiscoveryGroup } from "@hiveforyou/shared/discovery";

import type { Rulebook } from "@hiveforyou/domain-pack-shared/rulebook/schema";

import type { ProPackConfig } from "./pro-config";
import type { IntakeDomainPackExecutor } from "./intake-execution";

export const DOMAIN_PACK_CAPABILITIES = [
  "discover",
  "intake.work-purpose",
  "audience-roles",
  "study-context",
  "evidence-requirements",
  "document-interpretation",
] as const;

export type DomainPackCapability = (typeof DOMAIN_PACK_CAPABILITIES)[number];

export type DomainPackStatus = "scaffold" | "certified";

/**
 * Pack lifecycle (orthogonal):
 * - registered: present in domain-packs/registry
 * - routable: may appear in composer + Jev domain routing
 * - executable: Intake may run document-interpretation pipeline
 * - certified: status === "certified" (qualification complete; independent of executable in dev)
 */
export type DomainPackManifest = {
  id: string;
  name: string;
  description: string;
  version: string;
  status: DomainPackStatus;
  capabilities: readonly DomainPackCapability[];
  routable: boolean;
  executable: boolean;
};

export type DomainPackAudienceRole = {
  roleId: string;
  label: string;
};

/** Grouping for recognition vocabulary — not Engine 2 construct allowlists. */
export type DomainPackVocabularyCategory =
  | "plan"
  | "service"
  | "service_delivery"
  | "placement"
  | "evaluation"
  | "behavior"
  | "progress_measure"
  | "eligibility"
  | "meeting"
  | "staff_role"
  | "procedure"
  | "framework";

/**
 * Stable term for abbreviation expansion and surface-form normalization in documents.
 * Not legal definitions, not canonical constructs, not study findings.
 */
export type DomainPackVocabularyTerm = {
  termId: string;
  label: string;
  category: DomainPackVocabularyCategory;
  abbreviations?: readonly string[];
  aliases?: readonly string[];
  /** Expand abbreviation only when surrounding text supports IEP meaning. */
  contextRequired?: boolean;
  /** US state code when the term is state-specific. */
  jurisdiction?: string;
  regulation?: string;
};

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

export type DiscoverMissingExpectation = {
  id: string;
  packExpectationId: string;
  requirementClass: PackExpectationRequirementClass;
  expectedDocumentType: string;
  familyRole: string;
  groupId: string;
  reasonExpected: string;
  sequenceOrder: number;
};

export type DiscoverRelationshipKind = "precedes" | "supports" | "same_sequence" | "related";

export type DiscoverDomainPackSnapshot = {
  domainId: string;
  domainPackId: string;
  domainPackVersion: string;
  domainLabel: string;
  groups: DocumentDiscoveryGroup[];
  documentTypes: string[];
  familyRoles: string[];
  relationshipKinds: DiscoverRelationshipKind[];
  catalog: DiscoverCatalogEntry[];
  missingExpectations: DiscoverMissingExpectation[];
  /** Optional sharing-question roles. Omitted packs use the generic fallback after resolution. */
  audienceRoles?: DomainPackAudienceRole[];
};

export type CanonicalStudyPackSnapshot = {
  domainId: string;
  domainPackId: string;
  domainPackVersion: string;
  domainLabel: string;
  vocabulary: DomainPackVocabularySnapshot;
  /** Declarative study guidance injected beside the generic prompt (not hardcoded in core). */
  studyGuidance?: string;
  /** Construct keys emphasized for case-view layout and client summary selection. */
  focusConstructs?: string[];
};

/** Deterministic Case Map zone matching — display/grouping only, not validation. */
export type CaseMapZoneMatch = {
  /** Exact construct ids from the canonical snapshot. */
  constructs?: string[];
  /** Prefix match on claim.construct (snake_case). */
  constructPrefixes?: string[];
  /** Match claims whose subject entity has one of these entity types. */
  subjectEntityTypes?: string[];
};

export type CaseMapZoneDefinition = {
  zoneId: string;
  label: string;
  order: number;
  match?: CaseMapZoneMatch;
  display?: Record<string, string>;
};

export type CaseMapProjectionPackSnapshot = {
  domainId: string;
  domainPackId: string;
  domainPackVersion: string;
  rootLabel?: string;
  fallbackZoneLabel?: string;
  zones: CaseMapZoneDefinition[];
};

export type NarrativeChapter = "then" | "since" | "now" | "next" | "ask";

export type NarrativeCondition =
  | { kind: "anchorExists"; role: "prior" | "current" }
  | { kind: "factExists"; slot: string }
  | { kind: "seriesPointAfter"; measure: string; anchor: "prior" }
  | { kind: "recordGapMonths"; gte: number }
  | { kind: "anchorsDiffer"; slot: string }
  | { kind: "topSignal" };

export type NarrativeTemplate = {
  id: string;
  chapter: NarrativeChapter;
  when: NarrativeCondition;
  say: string;
  slots: string[];
  maxPerStory?: number;
};

export type NarrativeBlock = {
  opening: string;
  chapters: NarrativeChapter[];
  templates: NarrativeTemplate[];
  plain: Record<string, Record<string, string>>;
};

/** Pack-owned labels/units for deterministic story skeleton (no sentences). */
export type StoryPackConfig = {
  anchorDocType: string;
  supportingWindowDays: number;
  gapMonths: number;
  gapExpectedDocTypes: string[];
  gapMissingLabel: string;
  plainLabels: Record<string, string>;
  plainValues: Record<string, Record<string, string>>;
  units: Record<string, string>;
};

/**
 * A loadable Domain Pack.
 * Manifest is required. Discover and study snapshots exist only when the pack defines them.
 */
export type DomainPack = {
  manifest: DomainPackManifest;
  discover?: DiscoverDomainPackSnapshot;
  study?: CanonicalStudyPackSnapshot;
  narrative: NarrativeBlock;
  story: StoryPackConfig;
  pro: ProPackConfig;
  /** Recognition/normalization terms (abbreviations, aliases) — optional per pack. */
  recognitionVocabulary?: readonly DomainPackVocabularyTerm[];
  /** Optional deterministic Case Map projection guidance (Slice 3). */
  caseMapProjection?: CaseMapProjectionPackSnapshot;
  /** Registered by domain-packs/registry when manifest.executable is true. */
  intakeExecutor?: IntakeDomainPackExecutor;
  /** Optional human-reviewed document guides and glossary for this domain. */
  rulebook?: Rulebook;
  /** Optional slot catalog for rulebook validation when narrative templates do not list them yet. */
  rulebookSlotCatalog?: readonly {
    id: string;
    label: string;
    sourceDocTypes: readonly string[];
  }[];
};

export type ResolvedDomainPack = {
  domainId: string;
  domainPackId: string;
  domainPackVersion: string;
  /** @deprecated Engine 2 no longer validates proposal semantics against this snapshot. */
  vocabulary: DomainPackVocabularySnapshot;
  audienceRoles?: DomainPackAudienceRole[];
};
