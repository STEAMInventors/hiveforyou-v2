import { createHash } from "node:crypto";

import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";
import type {
  ClaimValue,
  ProposedClaim,
  ProposedEntity,
} from "@hiveforyou/shared/case-intelligence/3";
import type { CanonicalStudyValidationResultV3 } from "@hiveforyou/shared/case-intelligence/3/validation-result";
import type { ReaderAcceptedFactsArtifact } from "@hiveforyou/shared/reader-accepted-facts";

import {
  documentIdsInContext,
  validateDocumentEvidenceRefs,
} from "./validate-document-evidence.js";

type WireFact = Record<string, unknown>;

function stableEntityId(label: string): string {
  return `entity-${createHash("sha256").update(label.trim().toLowerCase()).digest("hex").slice(0, 12)}`;
}

function claimIdFromFact(fact: WireFact, index: number): string {
  if (typeof fact.id === "string" && fact.id.trim()) {
    return fact.id.trim();
  }
  return `reader-claim-${index + 1}`;
}

function constructFromFact(fact: WireFact): string {
  const constructRaw = fact.construct;
  if (constructRaw && typeof constructRaw === "object") {
    const measure = (constructRaw as { measure?: unknown }).measure;
    if (typeof measure === "string" && measure.trim()) {
      return measure.trim();
    }
  }
  return "unspecified";
}

function claimValueFromWire(value: unknown): ClaimValue | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const kind = record.kind;
  if (kind === "text" && typeof record.text === "string" && record.text.trim()) {
    return { kind: "text", text: record.text.trim() };
  }
  if (kind === "quantity" && typeof record.amount === "number" && Number.isFinite(record.amount)) {
    return {
      kind: "quantity",
      amount: record.amount,
    };
  }
  if (kind === "code" && typeof record.code === "string" && record.code.trim()) {
    return { kind: "code", code: record.code.trim() };
  }
  if (kind === "entity_ref" && typeof record.entityId === "string") {
    return { kind: "entity_ref", entityId: record.entityId };
  }
  if (typeof record.text === "string" && record.text.trim()) {
    return { kind: "text", text: record.text.trim() };
  }
  return null;
}

function evidenceFromFact(fact: WireFact): ProposedClaim["evidenceRefs"] {
  const evidenceRaw = fact.evidence ?? fact.evidenceRefs;
  if (!Array.isArray(evidenceRaw)) {
    return [];
  }
  const refs: ProposedClaim["evidenceRefs"] = [];
  for (const item of evidenceRaw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const ev = item as Record<string, unknown>;
    const sourceDocumentId = String(ev.sourceDocumentId ?? ev.documentId ?? "").trim();
    const page = Number(ev.page ?? ev.pageNumber ?? 0);
    const quote = String(ev.quote ?? ev.snippet ?? "").trim();
    if (!sourceDocumentId || page <= 0 || !quote) {
      continue;
    }
    refs.push({
      id: typeof ev.id === "string" ? ev.id : `ev-${refs.length + 1}`,
      sourceType: "document",
      sourceDocumentId,
      page,
      snippet: quote,
      logicalDocumentId:
        typeof ev.logicalDocumentId === "string" ? ev.logicalDocumentId : undefined,
    });
  }
  return refs;
}

function subjectLabelFromFact(fact: WireFact): string {
  const subject = fact.subjectEntityId ?? fact.subject;
  if (typeof subject === "string" && subject.trim()) {
    return subject.trim();
  }
  return "case_subject";
}

export function consolidateVerifiedReaderFacts(input: {
  context: CanonicalStudyContext;
  acceptedFacts: ReaderAcceptedFactsArtifact;
}): CanonicalStudyValidationResultV3 {
  const entitiesByLabel = new Map<string, ProposedEntity>();
  const claims: ProposedClaim[] = [];
  const rejected: CanonicalStudyValidationResultV3["rejected"] = [];

  const knownDocs = documentIdsInContext(input.context);
  const facts = input.acceptedFacts.facts as WireFact[];
  for (let index = 0; index < facts.length; index += 1) {
    const fact = facts[index]!;
    const subjectLabel = subjectLabelFromFact(fact);
    let entity = entitiesByLabel.get(subjectLabel);
    if (!entity) {
      entity = {
        id: stableEntityId(subjectLabel),
        label: subjectLabel,
        entityType: "person_or_organization",
        evidenceRefs: [],
      };
      entitiesByLabel.set(subjectLabel, entity);
    }

    const value = claimValueFromWire(fact.value);
    const evidenceRefs = evidenceFromFact(fact);
    if (!value || evidenceRefs.length === 0) {
      rejected.push({
        severity: "reject",
        code: "READER_FACT_SHAPE_INVALID",
        message: "Accepted reader fact missing value or evidence.",
        relatedIds: [claimIdFromFact(fact, index)],
      });
      continue;
    }

    const claim: ProposedClaim = {
      id: claimIdFromFact(fact, index),
      subjectEntityId: entity.id,
      construct: constructFromFact(fact),
      value,
      role: "observed",
      evidenceRefs,
    };

    const evidenceErrors = validateDocumentEvidenceRefs(
      input.context,
      claim.id,
      claim.evidenceRefs,
      knownDocs,
      `claims.${claim.id}`,
      { requireAtLeastOne: true, requireLocator: true },
    );
    if (evidenceErrors.length > 0) {
      rejected.push(...evidenceErrors);
      continue;
    }
    claims.push(claim);
  }

  const status =
    claims.length === 0
      ? "FAILED"
      : rejected.length > 0
        ? "NEEDS_REVIEW"
        : "SUCCEEDED";

  return {
    status,
    accepted: {
      entities: [...entitiesByLabel.values()],
      claims,
      conflicts: [],
      missingInformation: [],
    },
    rejected,
    warnings: [],
    unresolved: [],
    validationErrors: status === "FAILED" ? rejected : [],
    provenanceErrors: [],
    integrityErrors: [],
  };
}
