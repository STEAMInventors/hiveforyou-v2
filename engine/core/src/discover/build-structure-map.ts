import type { DiscoverDomainPackSnapshot } from "@hiveforyou/domain-packs";
import { discoverPackForDomain, getDiscoverPackByDomainId } from "@hiveforyou/domain-packs";
import type {
  CustomerDiscoveryAnswer,
  HiveDiscoverResolutionProposalV1,
  ProposedDomainGroup,
  StructureMap,
  StructureMapDomainGroup,
  StructureMapUnresolved,
} from "@hiveforyou/shared/discover";
import { HIVE_STRUCTURE_MAP_SCHEMA, normalizeDomainResolutionStatus } from "@hiveforyou/shared/discover";

import {
  deriveDocumentCategoriesForDomainGroup,
  enrichDomainGroupsWithCategories,
  resolvedDomainId,
} from "./aggregate-domain-groups";
import type { MissingEvidenceDisposition } from "./check-pack-completeness";
import * as packCompleteness from "./check-pack-completeness";
import type { DiscoverSourceDocumentInput } from "./types";
import { resolveActiveDiscoverPack } from "./validate-discovery-proposal";

function logicalDocumentIdsForDomain(
  listedIds: string[],
  logicalDocuments: Array<{ id: string; domainId: string }>,
  domainId: string,
): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of listedIds) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
  }
  for (const doc of logicalDocuments) {
    if (resolvedDomainId(doc.domainId) === domainId && !seen.has(doc.id)) {
      seen.add(doc.id);
      ids.push(doc.id);
    }
  }
  return ids;
}

export function buildStructureMap(input: {
  discoverRunId: string;
  caseId: string;
  pack: DiscoverDomainPackSnapshot;
  resolution: HiveDiscoverResolutionProposalV1;
  domainGroups?: ProposedDomainGroup[];
  sources: DiscoverSourceDocumentInput[];
  customerAnswers: CustomerDiscoveryAnswer[];
  customerObjective?: string;
  promptVersion: string;
  promptSha256: string;
  providerId: string;
  modelId?: string;
  resolutionPromptVersion?: string;
  resolutionPromptSha256?: string;
  dispositions?: MissingEvidenceDisposition[];
}): StructureMap {
  const unresolved: StructureMapUnresolved[] = [];
  const normalizedStatus = normalizeDomainResolutionStatus(input.resolution.domainResolution.status);

  if (normalizedStatus === "AMBIGUOUS") {
    unresolved.push({
      code: "DOMAIN_AMBIGUOUS",
      severity: "informational",
      message: "Domain routing remains ambiguous after resolution.",
    });
  }
  if (normalizedStatus === "MULTI_DOMAIN") {
    unresolved.push({
      code: "DOMAIN_MULTI",
      severity: "informational",
      message: "Multiple domains detected; each domain group was validated independently.",
    });
  }

  for (const ambiguityId of input.resolution.unresolvedAmbiguityIds) {
    unresolved.push({
      code: "UNRESOLVED_AMBIGUITY",
      severity: "blocking",
      message: `Unresolved structural ambiguity: ${ambiguityId}`,
    });
  }

  const primaryPack =
    getDiscoverPackByDomainId(input.resolution.logicalDocuments[0]?.domainId ?? "") ??
    resolveActiveDiscoverPack({
      schemaVersion: "hive-discover-proposal/1",
      domainResolution: {
        ...input.resolution.domainResolution,
        status: normalizedStatus,
      },
      logicalDocuments: input.resolution.logicalDocuments,
      relationships: input.resolution.relationships,
      missingExpectedDocuments: [],
    }) ??
    input.pack;

  const logicalDocuments = input.resolution.logicalDocuments.map((doc) => ({
    id: doc.id,
    domainId: doc.domainId ?? primaryPack.domainId,
    sourceDocumentId: doc.sourceDocumentId,
    pageStart: doc.pageStart,
    pageEnd: doc.pageEnd,
    documentType: doc.documentType,
    title: doc.title,
    documentDate: doc.documentDate,
    familyRole: doc.familyRole,
    groupId: doc.groupId,
    recognitionStatus: doc.recognitionStatus,
    sequenceOrder: doc.sequenceOrder,
    provenance: "UPLOADED_EVIDENCE" as const,
  }));

  const chronology = [...logicalDocuments]
    .filter((doc) => doc.documentDate || doc.sequenceOrder != null)
    .sort((a, b) => {
      if (a.documentDate && b.documentDate) {
        return a.documentDate.localeCompare(b.documentDate);
      }
      return (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0);
    })
    .map((doc, index) => ({
      logicalDocumentId: doc.id,
      orderingKey: doc.documentDate ?? String(doc.sequenceOrder ?? index),
      source: doc.documentDate ? ("MODEL" as const) : ("PACK" as const),
    }));

  const blocking = unresolved.some((item) => item.severity === "blocking");
  const routedDomainGroups = enrichDomainGroupsWithCategories(
    input.domainGroups ?? [],
    input.resolution.logicalDocuments,
  );
  let structureDomainGroups: StructureMapDomainGroup[] | undefined;
  let completeness: ReturnType<typeof packCompleteness.checkPackCompleteness>;

  if (routedDomainGroups.length > 0) {
    structureDomainGroups = routedDomainGroups.map((group) => {
      const groupPack = discoverPackForDomain(group.domainId, group.domainLabel);
      const logicalDocumentIds = logicalDocumentIdsForDomain(group.logicalDocumentIds, logicalDocuments, group.domainId);
      const groupDocs = logicalDocuments.filter((doc) => logicalDocumentIds.includes(doc.id));
      const groupCompleteness = packCompleteness.checkPackCompleteness({
        pack: groupPack,
        logicalDocuments: groupDocs,
        unresolvedBlocking: blocking,
        dispositions: input.dispositions,
      });
      return {
        id: group.domainId,
        domainId: group.domainId,
        domainLabel: group.domainLabel,
        logicalDocumentIds,
        description: group.description,
        documentCategories:
          group.documentCategories ??
          deriveDocumentCategoriesForDomainGroup({
            domainId: group.domainId,
            logicalDocumentIds: group.logicalDocumentIds,
            logicalDocuments: input.resolution.logicalDocuments,
          }),
        completeness: groupCompleteness,
      };
    });
    const mergedStatus = structureDomainGroups.some(
      (group) => group.completeness.status === "blocked_unresolved_structure",
    )
      ? "blocked_unresolved_structure"
      : structureDomainGroups.some((group) => group.completeness.status === "missing_evidence")
        ? "missing_evidence"
        : "complete";
    completeness = {
      status: mergedStatus,
      expectations: packCompleteness.dedupeCompletenessExpectations(
        structureDomainGroups.flatMap((group) => group.completeness.expectations),
      ),
    };
  } else {
    completeness = packCompleteness.checkPackCompleteness({
      pack: input.pack,
      logicalDocuments,
      unresolvedBlocking: blocking,
      dispositions: input.dispositions,
    });
  }

  return {
    schemaVersion: HIVE_STRUCTURE_MAP_SCHEMA,
    discoverRunId: input.discoverRunId,
    caseId: input.caseId,
    producedAt: new Date().toISOString(),
    domainResolution: {
      status: input.resolution.domainResolution.status,
      domainLabel: input.resolution.domainResolution.domainLabel || primaryPack.domainLabel,
      domainId: primaryPack.domainId,
      domainPackId: primaryPack.domainPackId,
      domainPackVersion: primaryPack.domainPackVersion,
      candidateDomainLabels: input.resolution.domainResolution.candidateDomainLabels,
    },
    domainGroups: structureDomainGroups,
    sourceDocuments: input.sources.map((source) => ({
      sourceDocumentId: source.sourceDocumentId,
      originalFilename: source.originalFilename,
      sizeBytes: source.sizeBytes,
    })),
    logicalDocuments,
    relationships: input.resolution.relationships.map((rel) => ({
      id: rel.id,
      fromLogicalDocumentId: rel.fromLogicalDocumentId,
      toLogicalDocumentId: rel.toLogicalDocumentId,
      kind: rel.kind,
      label: rel.label,
    })),
    chronology,
    discoveryAnswers: input.customerAnswers.map((answer) => ({
      questionId: answer.questionId,
      evidenceKind: "CUSTOMER_ASSERTION",
      answeredAt: answer.answeredAt,
      userId: answer.userId,
    })),
    unresolved,
    completeness,
    provenance: {
      promptVersion: input.promptVersion,
      promptSha256: input.promptSha256,
      providerId: input.providerId,
      modelId: input.modelId,
      resolutionPromptVersion: input.resolutionPromptVersion,
      resolutionPromptSha256: input.resolutionPromptSha256,
    },
  };
}
