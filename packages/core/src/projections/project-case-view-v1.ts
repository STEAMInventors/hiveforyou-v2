import type { CanonicalCaseSnapshot, ValidatedClaim } from "@hiveforyou/shared/case-intelligence/3";
import type { CaseCustomerContextSnapshot } from "@hiveforyou/shared/case-customer-context";
import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";
import { getStudyPackByDomainId } from "@hiveforyou/domain-packs";
import type {
  CaseAudit,
  CaseDocument,
  CaseEntity,
  CaseItem,
  CaseLayout,
  CaseProvenanceBundle,
  CaseView,
  Chip,
  ClientSummary,
  ConflictItem,
  ChangeItem,
  DisplayValue,
  EmptyFieldItem,
  FactItem,
  IdentityCandidate,
  IdentityItem,
  Modality,
  NotFoundItem,
  ResolvedEvidenceRef,
  SeriesPoint,
} from "@hiveforyou/shared/projections";
import { CASE_VIEW_SCHEMA, constructPartsFromCanonicalConstruct } from "@hiveforyou/shared/projections";

import { formatClaimValue, humanizeConstruct } from "./format-v3-claim";

function roleToModality(role: ValidatedClaim["role"]): Modality {
  switch (role) {
    case "planned":
    case "required":
    case "decided":
    case "observed":
    case "unknown":
      return role;
    case "current":
    case "historical":
      return "observed";
    case "superseded":
      return "unknown";
    default:
      return "unknown";
  }
}

function toDisplayValue(claim: ValidatedClaim): DisplayValue {
  const unit = claim.unit ?? null;
  const display = formatClaimValue(claim.value, claim.unit);
  const base = {
    display,
    numberValue: null as number | null,
    unit,
    textValue: null as string | null,
    codeValue: null as string | null,
    booleanValue: null as boolean | null,
    entityId: null as string | null,
    dateValue: null as string | null,
    periodStart: null as string | null,
    periodEnd: null as string | null,
  };
  switch (claim.value.kind) {
    case "quantity":
      return { ...base, kind: "quantity", numberValue: claim.value.amount };
    case "text":
      return { ...base, kind: "text", textValue: claim.value.text };
    case "code":
      return { ...base, kind: "code", codeValue: claim.value.code };
    case "boolean":
      return { ...base, kind: "boolean", booleanValue: claim.value.value };
    case "entity_ref":
      return { ...base, kind: "entity_ref", entityId: claim.value.entityId };
    case "date":
      return { ...base, kind: "date", dateValue: claim.value.value };
    case "period":
      return {
        ...base,
        kind: "period",
        periodStart: claim.value.start ?? null,
        periodEnd: claim.value.end ?? null,
      };
    default:
      return { ...base, kind: "unknown", display: "unknown" };
  }
}

function resolvedRefsForClaim(
  claimId: string,
  provenance: CaseProvenanceBundle | null | undefined,
): ResolvedEvidenceRef[] {
  return provenance?.claims.find((row) => row.claimId === claimId)?.documentEvidence ?? [];
}

function chipsFromResolvedRefs(refs: ResolvedEvidenceRef[]): Chip[] {
  return refs.map((ref) => ({
    evidenceId: ref.evidenceRefId ?? ref.id,
    sourceDocumentId: ref.sourceDocumentId,
    logicalDocumentId: ref.logicalDocumentId ?? null,
    fileName: ref.sourceFilename ?? ref.logicalTitle ?? "Source",
    page: ref.physicalPageNumber ?? ref.page ?? 1,
    extractionId: ref.extractionId ?? null,
    quote: ref.canonicalTextSnippet ?? ref.snippet ?? "",
  }));
}

function chipsForClaim(
  claim: ValidatedClaim,
  provenance: CaseProvenanceBundle | null | undefined,
): Chip[] {
  const resolved = resolvedRefsForClaim(claim.id, provenance);
  if (resolved.length) {
    return chipsFromResolvedRefs(resolved);
  }
  return claim.evidenceRefs.map((ref) => ({
    evidenceId: ref.id,
    sourceDocumentId: ref.sourceDocumentId,
    logicalDocumentId: ref.logicalDocumentId ?? null,
    fileName: ref.sourceDocumentId,
    page: ref.page ?? 1,
    extractionId: ref.extractionId ?? null,
    quote: ref.snippet ?? "",
  }));
}

function labelForConstruct(constructKey: string): string {
  const parts = constructPartsFromCanonicalConstruct(constructKey);
  const pieces = [parts.measure, parts.task, parts.administration].filter(Boolean);
  return humanizeConstruct(pieces.join(" "));
}

function focusConstructsForDomain(domainId: string): string[] {
  return getStudyPackByDomainId(domainId)?.focusConstructs ?? [];
}

function normalizeNameTokens(label: string): string[] {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function isPersonEntityType(entityType: string): boolean {
  const normalized = entityType.toLowerCase();
  return normalized.includes("student") || normalized.includes("person") || normalized.includes("child");
}

function buildUnclearIdentityItems(input: {
  intelligence: CanonicalCaseSnapshot;
  focusConstructs: string[];
  priorityStart: number;
}): { items: IdentityItem[]; nextPriority: number } {
  const { intelligence, focusConstructs } = input;
  let priority = input.priorityStart;
  const items: IdentityItem[] = [];
  const entityById = new Map(intelligence.entities.map((entity) => [entity.id, entity]));
  const claimsById = new Map(intelligence.claims.map((claim) => [claim.id, claim]));

  const consumedEntityIds = new Set<string>();

  for (const unresolved of intelligence.unresolved) {
    if (unresolved.kind !== "missing_information") {
      continue;
    }
    const description = unresolved.description?.toLowerCase() ?? "";
    const identityHint =
      description.includes("identity") ||
      description.includes("same person") ||
      description.includes("same student") ||
      unresolved.relatedConstruct?.includes("identity");
    if (!identityHint) {
      continue;
    }
    const candidateIds = new Set<string>();
    for (const claimId of unresolved.relatedClaimIds ?? []) {
      const claim = claimsById.get(claimId);
      if (claim?.value.kind === "entity_ref") {
        candidateIds.add(claim.value.entityId);
      }
      if (claim?.subjectEntityId) {
        candidateIds.add(claim.subjectEntityId);
      }
    }
    if (unresolved.subjectEntityId) {
      candidateIds.add(unresolved.subjectEntityId);
    }
    const candidates: IdentityCandidate[] = [...candidateIds]
      .map((entityId) => entityById.get(entityId))
      .filter(Boolean)
      .map((entity) => ({
        entityId: entity!.id,
        displayName: entity!.label,
        chips: entity!.evidenceRefs.map((ref) => ({
          evidenceId: ref.id,
          sourceDocumentId: ref.sourceDocumentId,
          logicalDocumentId: ref.logicalDocumentId ?? null,
          fileName: ref.sourceDocumentId,
          page: ref.page ?? 1,
          extractionId: ref.extractionId ?? null,
          quote: ref.snippet ?? "",
        })),
      }));
    if (candidates.length < 2) {
      continue;
    }
    for (const candidate of candidates) {
      consumedEntityIds.add(candidate.entityId);
    }
    items.push({
      itemId: `itm_id_${unresolved.id}`,
      state: "unclear_identity",
      label: unresolved.description?.trim() || "Unclear identity",
      inFocus: true,
      priority: priority++,
      candidates,
      proDecision: null,
    });
  }

  const people = intelligence.entities.filter((entity) => isPersonEntityType(entity.entityType));
  for (let i = 0; i < people.length; i += 1) {
    for (let j = i + 1; j < people.length; j += 1) {
      const left = people[i]!;
      const right = people[j]!;
      if (consumedEntityIds.has(left.id) || consumedEntityIds.has(right.id)) {
        continue;
      }
      const leftTokens = new Set(normalizeNameTokens(left.label));
      const rightTokens = normalizeNameTokens(right.label);
      const overlap = rightTokens.some((token) => leftTokens.has(token));
      if (!overlap) {
        continue;
      }
      consumedEntityIds.add(left.id);
      consumedEntityIds.add(right.id);
      items.push({
        itemId: `itm_id_auto_${left.id}_${right.id}`,
        state: "unclear_identity",
        label: `Are ${left.label} and ${right.label} the same person?`,
        inFocus: focusConstructs.length === 0 || true,
        priority: priority++,
        candidates: [left, right].map((entity) => ({
          entityId: entity.id,
          displayName: entity.label,
          chips: entity.evidenceRefs.map((ref) => ({
            evidenceId: ref.id,
            sourceDocumentId: ref.sourceDocumentId,
            logicalDocumentId: ref.logicalDocumentId ?? null,
            fileName: ref.sourceDocumentId,
            page: ref.page ?? 1,
            extractionId: ref.extractionId ?? null,
            quote: ref.snippet ?? "",
          })),
        })),
        proDecision: null,
      });
    }
  }

  return { items, nextPriority: priority };
}

function buildCaseDocuments(input: {
  intelligence: CanonicalCaseSnapshot;
  logicalDocuments?: CanonicalStudyContext["logicalDocuments"];
}): CaseDocument[] {
  const { intelligence, logicalDocuments } = input;
  const filenameBySource = new Map(
    intelligence.sourceDocuments.map((doc) => [
      doc.sourceDocumentId ?? doc.stagedDocumentId ?? "",
      doc.originalFilename,
    ]),
  );

  if (logicalDocuments?.length) {
    return logicalDocuments.map((logical) => {
      const readStatus: CaseDocument["readStatus"] =
        logical.recognitionStatus === "ambiguous" || logical.recognitionStatus === "unrecognized"
          ? "partially_read"
          : "read";
      return {
        logicalDocumentId: logical.id,
        sourceDocumentId: logical.sourceDocumentId,
        fileName:
          logical.title?.trim() ||
          filenameBySource.get(logical.sourceDocumentId) ||
          logical.sourceDocumentId,
        documentType: logical.documentType,
        documentDate: logical.documentDate ?? null,
        pageStart: logical.pageStart,
        pageEnd: logical.pageEnd ?? logical.pageStart,
        readStatus,
      };
    });
  }

  return intelligence.sourceDocuments.map((doc, index) => ({
    logicalDocumentId: doc.sourceDocumentId ?? doc.stagedDocumentId ?? `doc_${index}`,
    sourceDocumentId: doc.sourceDocumentId ?? doc.stagedDocumentId ?? `doc_${index}`,
    fileName: doc.originalFilename,
    documentType: "document",
    documentDate: null,
    pageStart: 1,
    pageEnd: 1,
    readStatus: "read" as const,
  }));
}

function isInFocus(constructKey: string, focusConstructs: string[]): boolean {
  if (!focusConstructs.length) {
    return true;
  }
  return focusConstructs.some(
    (focus) =>
      constructKey === focus ||
      constructKey.startsWith(`${focus}|`) ||
      constructKey.includes(focus),
  );
}

function buildAudit(intelligence: CanonicalCaseSnapshot): CaseAudit {
  const validation = intelligence.validationResult;
  const rejected = validation.rejected ?? [];
  const acceptedMissing = validation.accepted.missingInformation ?? [];
  const reasonCounts = new Map<string, number>();
  for (const issue of rejected) {
    const key = issue.code ?? "rejected";
    reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1);
  }
  const proposed =
    validation.accepted.claims.length +
    validation.accepted.conflicts.length +
    acceptedMissing.length +
    rejected.length;
  return {
    proposed,
    accepted:
      validation.accepted.claims.length +
      validation.accepted.conflicts.length +
      acceptedMissing.length,
    rejected: rejected.length,
    rejectionReasons: [...reasonCounts.entries()].map(([reason, count]) => ({ reason, count })),
    rejectedProposalIds: rejected
      .map((issue) => issue.relatedIds?.[0])
      .filter((id): id is string => Boolean(id)),
  };
}

function emptyClientSummary(): ClientSummary {
  return {
    selectionRule: "conflicting>changed>empty_field; inFocus first; max 5",
    items: [],
    emptyStateText: "Summary copy will appear after the client-summary pass.",
    notes: [],
    requests: [],
    questions: [],
    writtenBy: null,
  };
}

export function projectCaseViewV1(input: {
  intelligence: CanonicalCaseSnapshot;
  provenance?: CaseProvenanceBundle | null;
  customerContext?: CaseCustomerContextSnapshot | null;
  statedWorkPurpose?: string | null;
  logicalDocuments?: CanonicalStudyContext["logicalDocuments"];
  proposalSchema?: CaseView["proposalSchema"];
}): CaseView {
  const { intelligence, provenance, customerContext, statedWorkPurpose, logicalDocuments } = input;
  const claimsById = new Map(intelligence.claims.map((claim) => [claim.id, claim]));
  const focusConstructs = focusConstructsForDomain(intelligence.domainId);
  const proposalSchema = input.proposalSchema ?? "canonical-study-proposal/3";

  const conflictClaimIds = new Set(
    intelligence.conflicts.flatMap((conflict) => conflict.claimIds),
  );
  const changeClaimIds = new Set(
    intelligence.changes.flatMap((change) => [change.fromClaimId, change.toClaimId]),
  );

  const items: CaseItem[] = [];
  let priority = 10;

  const identityBlock = buildUnclearIdentityItems({
    intelligence,
    focusConstructs,
    priorityStart: priority,
  });
  items.push(...identityBlock.items);
  priority = identityBlock.nextPriority;

  for (const conflict of intelligence.conflicts) {
    const sides = conflict.claimIds
      .map((id) => claimsById.get(id))
      .filter((claim): claim is ValidatedClaim => Boolean(claim));
    if (sides.length < 2) {
      continue;
    }
    const constructKey =
      conflict.construct ?? sides[0]?.construct ?? "conflict";
    const construct = constructPartsFromCanonicalConstruct(constructKey);
    const itemId = `itm_conf_${conflict.id}`;
    const inFocus = isInFocus(construct.key, focusConstructs);
    items.push({
      itemId,
      state: "conflicting",
      label: labelForConstruct(construct.key),
      inFocus,
      priority: priority++,
      conflictKind: conflict.kind,
      construct,
      subjectEntityId: conflict.subjectEntityId ?? sides[0]!.subjectEntityId,
      sides: sides.map((claim) => ({
        claimId: claim.id,
        value: toDisplayValue(claim),
        modality: roleToModality(claim.role),
        occurredOn: claim.occurredOn ?? null,
        chips: chipsForClaim(claim, provenance),
      })),
      proNote: null,
    } satisfies ConflictItem);
  }

  for (const change of intelligence.changes) {
    const fromClaim = claimsById.get(change.fromClaimId);
    const toClaim = claimsById.get(change.toClaimId);
    if (!fromClaim || !toClaim) {
      continue;
    }
    const construct = constructPartsFromCanonicalConstruct(change.construct);
    const series: SeriesPoint[] = [fromClaim, toClaim]
      .map((claim) => ({
        claim,
        anchor:
          claim.occurredOn ??
          claim.effectivePeriod?.start ??
          intelligence.createdAt.slice(0, 10),
      }))
      .sort((a, b) => a.anchor.localeCompare(b.anchor))
      .map(({ claim, anchor }) => ({
        claimId: claim.id,
        anchorDate: anchor,
        value: toDisplayValue(claim),
        modality: roleToModality(claim.role),
        chips: chipsForClaim(claim, provenance),
      }));
    const itemId = `itm_chg_${change.id}`;
    items.push({
      itemId,
      state: "changed",
      label: labelForConstruct(construct.key),
      inFocus: isInFocus(construct.key, focusConstructs),
      priority: priority++,
      construct,
      subjectEntityId: change.subjectEntityId,
      series,
    } satisfies ChangeItem);
  }

  for (const unresolved of intelligence.unresolved) {
    if (unresolved.kind === "missing_document") {
      const itemId = `itm_nf_${unresolved.id}`;
      items.push({
        itemId,
        state: "not_found",
        label: unresolved.description?.trim() || "Expected document",
        inFocus: true,
        priority: priority++,
        description: unresolved.description?.trim() || "Document not found in supplied files.",
        source: "pack_expected_fact",
        request: {
          requestId: unresolved.id,
          documentType:
            unresolved.relatedConstruct?.trim() ||
            unresolved.relatedLogicalDocumentIds?.[0] ||
            "document",
          label: unresolved.description?.trim() || "Missing document",
          status: "open",
        },
        relatedItemIds: [],
      } satisfies NotFoundItem);
      continue;
    }
    if (unresolved.kind === "missing_information") {
      const hasChip = Boolean(unresolved.evidenceRefs?.length);
      const itemId = hasChip ? `itm_gap_${unresolved.id}` : `itm_nf_${unresolved.id}`;
      if (hasChip) {
        items.push({
          itemId,
          state: "empty_field",
          label: unresolved.description?.trim() || "Empty field",
          inFocus: isInFocus(unresolved.relatedConstruct ?? "", focusConstructs),
          priority: priority++,
          description: unresolved.description?.trim() || "Field present without value.",
          chips: (unresolved.evidenceRefs ?? []).map((ref) => ({
            evidenceId: ref.id,
            sourceDocumentId: ref.sourceDocumentId,
            logicalDocumentId: ref.logicalDocumentId ?? null,
            fileName: ref.sourceDocumentId,
            page: ref.page ?? 1,
            extractionId: ref.extractionId ?? null,
            quote: ref.snippet ?? "",
          })),
          relatedItemIds: [],
        } satisfies EmptyFieldItem);
      } else {
        items.push({
          itemId,
          state: "not_found",
          label: unresolved.description?.trim() || "Information gap",
          inFocus: isInFocus(unresolved.relatedConstruct ?? "", focusConstructs),
          priority: priority++,
          description: unresolved.description?.trim() || "Not found in supplied documents.",
          source: "proposal_gap",
          request: {
            requestId: unresolved.id,
            documentType: "unknown",
            label: unresolved.description?.trim() || "Missing information",
            status: "open",
          },
          relatedItemIds: unresolved.relatedClaimIds ?? [],
        } satisfies NotFoundItem);
      }
    }
  }

  for (const claim of intelligence.claims) {
    if (conflictClaimIds.has(claim.id) || changeClaimIds.has(claim.id)) {
      continue;
    }
    const construct = constructPartsFromCanonicalConstruct(claim.construct);
    items.push({
      itemId: `itm_fact_${claim.id}`,
      state: "established",
      label: labelForConstruct(construct.key),
      inFocus: isInFocus(construct.key, focusConstructs),
      priority: priority + 100,
      claimId: claim.id,
      subjectEntityId: claim.subjectEntityId,
      construct,
      value: toDisplayValue(claim),
      modality: roleToModality(claim.role),
      occurredOn: claim.occurredOn ?? null,
      effectivePeriod: claim.effectivePeriod
        ? {
            start: claim.effectivePeriod.start ?? null,
            end: claim.effectivePeriod.end ?? null,
          }
        : null,
      chips: chipsForClaim(claim, provenance),
    } satisfies FactItem);
  }

  const needsDecision = items.filter(
    (item) => item.state === "conflicting" || item.state === "unclear_identity",
  );
  const changed = items.filter((item) => item.state === "changed");
  const gaps = items.filter(
    (item) => item.state === "empty_field" || item.state === "not_found",
  );
  const established = items.filter((item) => item.state === "established");

  const layout: CaseLayout = {
    needsDecision: {
      inFocus: needsDecision.filter((item) => item.inFocus).map((item) => item.itemId),
      outOfFocus: needsDecision.filter((item) => !item.inFocus).map((item) => item.itemId),
    },
    changed: changed.map((item) => item.itemId),
    gaps: gaps.map((item) => item.itemId),
    facts: [
      {
        groupId: "grp_all_established",
        label: "Established facts",
        entityId: null,
        itemIds: established.slice(0, 24).map((item) => item.itemId),
      },
    ],
  };

  const documents = buildCaseDocuments({ intelligence, logicalDocuments });

  const entities: CaseEntity[] = intelligence.entities.map((entity) => ({
    entityId: entity.id,
    displayName: entity.label,
    entityType: entity.entityType,
    aliases: [],
  }));

  const domainObjective = customerContext?.domains?.find(
    (row) => row.domainId === intelligence.domainId,
  );

  return {
    schemaVersion: CASE_VIEW_SCHEMA,
    caseId: intelligence.caseId,
    studyRunId: intelligence.studyRunId,
    proposalSchema,
    domainPack: {
      packId: intelligence.domainPackId,
      version: intelligence.domainPackVersion,
    },
    studiedAt: intelligence.createdAt,
    intent: {
      intentId: null,
      label: domainObjective?.objective?.trim() || "Your documents",
      clientText: statedWorkPurpose?.trim() || null,
      focusConstructs,
    },
    documents,
    entities,
    counts: {
      needsDecision: needsDecision.length,
      changed: changed.length,
      gaps: gaps.length,
      established: established.length,
      rejected: intelligence.validationResult.rejected.length,
    },
    items,
    layout,
    clientSummary: emptyClientSummary(),
    audit: buildAudit(intelligence),
  };
}
