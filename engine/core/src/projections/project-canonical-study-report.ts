import type {
  CanonicalStudyArtifact,
  CanonicalStudyProvenanceChip,
  CanonicalStudyRelation,
} from "@hiveforyou/shared/canonical-study-artifact";
import type {
  CanonicalStudyReportAudience,
  CanonicalStudyReportChangeRow,
  CanonicalStudyReportClaimRef,
  CanonicalStudyReportCustomerBody,
  CanonicalStudyReportEvidenceChip,
  CanonicalStudyReportFactLine,
  CanonicalStudyReportOpenQuestion,
  CanonicalStudyReportProBody,
  CanonicalStudyReportProExportTable,
  CanonicalStudyReportProFlagRow,
  CanonicalStudyReportProLedgerRow,
  CanonicalStudyReportProOperativeView,
  CanonicalStudyReportProQuotation,
  CanonicalStudyReportProRelationRow,
  CanonicalStudyReportProRequirementRow,
  CanonicalStudyReportProSeriesRow,
  CanonicalStudyReportProjection,
  CanonicalStudyReportPublicationInput,
  CanonicalStudyReportStorySection,
  CanonicalStudyReportSupportRow,
} from "@hiveforyou/shared/canonical-study-report-projection";
import {
  CANONICAL_STUDY_REPORT_PROJECTION_SCHEMA_VERSION,
  resolveCanonicalStudyReportPresentationMode,
} from "@hiveforyou/shared/canonical-study-report-projection";

import {
  assertCanonicalStudyReportProjection,
  indexProvenanceChips,
  resolveProvenanceChipForRecordField,
} from "./validate-canonical-study-report-projection.js";

export type ProjectCanonicalStudyReportInput = CanonicalStudyReportPublicationInput & {
  artifact: CanonicalStudyArtifact;
  audience: CanonicalStudyReportAudience;
};

function claimRef(
  fieldKey: string,
  context?: Omit<CanonicalStudyReportClaimRef, "fieldKey">,
): CanonicalStudyReportClaimRef {
  return { fieldKey, ...context };
}

function formatDisplayValue(chip: CanonicalStudyProvenanceChip): string {
  const unit = chip.normalized.unit?.trim();
  const base =
    chip.normalized.displayValue != null && String(chip.normalized.displayValue).trim().length > 0
      ? String(chip.normalized.displayValue)
      : JSON.stringify(chip.normalized.normalizedValue);
  return unit ? `${base} ${unit}` : base;
}

function assertionKindFromChip(
  chip: CanonicalStudyProvenanceChip,
): CanonicalStudyReportFactLine["assertionKind"] {
  const provenanceClass = (chip.provenanceClass ?? "quoted").toLowerCase();
  if (provenanceClass === "classified") {
    return "classified";
  }
  if (provenanceClass === "derived") {
    return "derived";
  }
  const hasQuote = chip.evidence.some((item) => item.quote?.trim().length > 0);
  return hasQuote ? "verified_quoted" : "unresolved";
}

function evidenceFromChip(chip: CanonicalStudyProvenanceChip): CanonicalStudyReportEvidenceChip[] {
  return chip.evidence
    .filter((item) => item.quote?.trim().length > 0)
    .map((item) => ({
      claimRef: claimRef(chip.fieldKey, { contextKind: "provenance_chip" }),
      sourceDocumentId: item.sourceDocumentId,
      page: item.page,
      quote: item.quote,
      provenanceClass: chip.provenanceClass ?? "quoted",
    }));
}

function factLineFromChip(
  chip: CanonicalStudyProvenanceChip,
  entityId: string | null,
): CanonicalStudyReportFactLine | null {
  const assertionKind = assertionKindFromChip(chip);
  const evidence = evidenceFromChip(chip);
  if (assertionKind === "unresolved" || evidence.length === 0) {
    return null;
  }
  return {
    claimRef: claimRef(chip.fieldKey, { contextKind: "provenance_chip" }),
    entityId,
    recordTypeId: chip.recordTypeId,
    fieldId: chip.fieldId,
    sourceDocumentId: chip.sourceDocumentId,
    displayText: formatDisplayValue(chip),
    assertionKind,
    evidence,
  };
}

function compareFactLines(a: CanonicalStudyReportFactLine, b: CanonicalStudyReportFactLine): number {
  return (
    a.sourceDocumentId.localeCompare(b.sourceDocumentId) ||
    a.recordTypeId.localeCompare(b.recordTypeId) ||
    a.fieldId.localeCompare(b.fieldId) ||
    a.claimRef.fieldKey.localeCompare(b.claimRef.fieldKey)
  );
}

function collectEntityFacts(artifact: CanonicalStudyArtifact): CanonicalStudyReportFactLine[] {
  const chipIndex = indexProvenanceChips(artifact);
  const facts: CanonicalStudyReportFactLine[] = [];
  for (const entity of artifact.entities) {
    for (const version of entity.recordVersions) {
      for (const fieldKey of version.fieldKeys) {
        const chip =
          resolveProvenanceChipForRecordField(version, fieldKey) ?? chipIndex.get(fieldKey);
        if (!chip) {
          continue;
        }
        const line = factLineFromChip(chip, entity.id);
        if (line) {
          facts.push(line);
        }
      }
    }
  }
  facts.sort(compareFactLines);
  return facts;
}

function buildStorySections(
  artifact: CanonicalStudyArtifact,
  facts: CanonicalStudyReportFactLine[],
): CanonicalStudyReportStorySection[] {
  const factsByDoc = new Map<string, CanonicalStudyReportFactLine[]>();
  for (const fact of facts) {
    const bucket = factsByDoc.get(fact.sourceDocumentId) ?? [];
    bucket.push(fact);
    factsByDoc.set(fact.sourceDocumentId, bucket);
  }

  const documents = [...artifact.documents].sort((a, b) => a.sortRank - b.sortRank);
  return documents.map((doc) => {
    const docFacts = (factsByDoc.get(doc.sourceDocumentId) ?? []).sort(compareFactLines);
    const typeLabel = doc.documentTypeId?.trim() || "Document";
    const dateSuffix = doc.verifiedOrderingDate ? ` · ${doc.verifiedOrderingDate}` : "";
    return {
      id: `story:${doc.sourceDocumentId}`,
      sortRank: doc.sortRank,
      sourceDocumentId: doc.sourceDocumentId,
      documentTypeId: doc.documentTypeId,
      orderingDate: doc.verifiedOrderingDate,
      title: `${typeLabel}${dateSuffix}`,
      facts: docFacts,
    };
  });
}

function buildChangeAndSupportRows(
  artifact: CanonicalStudyArtifact,
  chipIndex: Map<string, CanonicalStudyProvenanceChip>,
): { changes: CanonicalStudyReportChangeRow[]; supports: CanonicalStudyReportSupportRow[] } {
  const changes: CanonicalStudyReportChangeRow[] = [];
  const supports: CanonicalStudyReportSupportRow[] = [];

  const relationRows = [...artifact.relations].sort((a, b) => a.id.localeCompare(b.id));
  for (const relation of relationRows) {
    const left = factLineFromChip(relation.left, relation.entityId);
    const right = factLineFromChip(relation.right, relation.entityId);
    if (!left || !right) {
      continue;
    }
    if (relation.label === "CHANGE") {
      changes.push({
        relationId: relation.id,
        entityId: relation.entityId,
        fieldId: relation.fieldId,
        label: "CHANGE",
        left,
        right,
        temporalBasis: relation.temporalBasis,
      });
      continue;
    }
    if (relation.label === "MATCHES" || relation.label === "UNCHANGED") {
      supports.push({
        relationId: relation.id,
        label: relation.label,
        left,
        right,
      });
    }
  }

  void chipIndex;
  return { changes, supports };
}

function buildOpenQuestions(artifact: CanonicalStudyArtifact): CanonicalStudyReportOpenQuestion[] {
  const questions: CanonicalStudyReportOpenQuestion[] = [];

  for (const entity of [...artifact.entities].sort((a, b) => a.id.localeCompare(b.id))) {
    if (entity.status !== "identity_unresolved") {
      continue;
    }
    questions.push({
      id: `identity:${entity.id}`,
      kind: "identity_unresolved",
      title: `${entity.recordTypeId} identity unresolved`,
      detail: entity.reasons.join("; ") || "Identity could not be resolved from supplied evidence.",
      claimRefs: entity.recordVersions.flatMap((version) =>
        version.fieldKeys.flatMap((fieldKey) => {
          const chip = resolveProvenanceChipForRecordField(version, fieldKey);
          if (!chip) {
            return [];
          }
          return [claimRef(chip.fieldKey, { contextKind: "provenance_chip", contextId: entity.id })];
        }),
      ),
    });
  }

  for (const item of [...artifact.unresolvedItems].sort((a, b) => a.id.localeCompare(b.id))) {
    questions.push({
      id: item.id,
      kind: "unresolved_item",
      title: item.kind,
      detail: item.message,
      claimRefs: [],
    });
  }

  for (const comparison of [...artifact.unresolvedComparisons].sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    questions.push({
      id: comparison.id,
      kind: "unresolved_comparison",
      title: `Unresolved comparison on ${comparison.fieldId}`,
      detail: comparison.reason,
      claimRefs: [
        claimRef(comparison.left.fieldKey, {
          contextKind: "unresolved_comparison",
          contextId: comparison.id,
        }),
        claimRef(comparison.right.fieldKey, {
          contextKind: "unresolved_comparison",
          contextId: comparison.id,
        }),
      ],
    });
  }

  for (const flag of [...artifact.flags].sort((a, b) => a.id.localeCompare(b.id))) {
    if (flag.status === "unsupported") {
      continue;
    }
    questions.push({
      id: flag.id,
      kind: "flag",
      title: flag.question,
      detail: flag.message,
      claimRefs: flag.operands.map((chip) =>
        claimRef(chip.fieldKey, { contextKind: "flag", contextId: flag.id }),
      ),
    });
  }

  for (const requirement of [...artifact.requirements].sort((a, b) => a.id.localeCompare(b.id))) {
    if (
      requirement.outcome === "PRESENT" ||
      requirement.outcome === "NOT_APPLICABLE" ||
      requirement.outcome === "PRESENT_WITH_MISSING_FIELDS"
    ) {
      continue;
    }
    questions.push({
      id: requirement.id,
      kind: "requirement",
      title: requirement.ruleId,
      detail: requirement.message,
      claimRefs: requirement.evidence.map((chip) =>
        claimRef(chip.fieldKey, { contextKind: "requirement", contextId: requirement.id }),
      ),
    });
  }

  return questions;
}

function buildImportantFacts(facts: CanonicalStudyReportFactLine[]): CanonicalStudyReportFactLine[] {
  const operativeFieldIds = new Set([
    "statement",
    "value",
    "minutes_per_week",
    "category",
    "area",
    "assessment",
  ]);
  return facts
    .filter(
      (fact) =>
        fact.assertionKind === "verified_quoted" &&
        (operativeFieldIds.has(fact.fieldId) || fact.recordTypeId === "goal"),
    )
    .slice(0, 24);
}

function buildCustomerBody(
  artifact: CanonicalStudyArtifact,
  chipIndex: Map<string, CanonicalStudyProvenanceChip>,
): CanonicalStudyReportCustomerBody {
  const facts = collectEntityFacts(artifact);
  const { changes, supports } = buildChangeAndSupportRows(artifact, chipIndex);
  return {
    storySections: buildStorySections(artifact, facts),
    importantFacts: buildImportantFacts(facts),
    changes,
    supports,
    openQuestions: buildOpenQuestions(artifact),
  };
}

function buildProLedger(
  artifact: CanonicalStudyArtifact,
  chipIndex: Map<string, CanonicalStudyProvenanceChip>,
): CanonicalStudyReportProLedgerRow[] {
  const rows: CanonicalStudyReportProLedgerRow[] = [];
  for (const entity of [...artifact.entities].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const version of entity.recordVersions) {
      for (const fieldKey of [...version.fieldKeys].sort()) {
        const chip =
          resolveProvenanceChipForRecordField(version, fieldKey) ?? chipIndex.get(fieldKey);
        if (!chip) {
          continue;
        }
        const fact = factLineFromChip(chip, entity.id);
        if (!fact) {
          continue;
        }
        rows.push({
          ...fact,
          entityStatus: entity.status,
          instanceIndex: chip.instanceIndex,
          envelopeRef: chip.envelopeRef,
        });
      }
    }
  }
  rows.sort(
    (a, b) =>
      (a.entityId ?? "").localeCompare(b.entityId ?? "") ||
      a.recordTypeId.localeCompare(b.recordTypeId) ||
      a.fieldId.localeCompare(b.fieldId) ||
      a.instanceIndex - b.instanceIndex,
  );
  return rows;
}

function buildQuotations(ledger: CanonicalStudyReportProLedgerRow[]): CanonicalStudyReportProQuotation[] {
  const quotes: CanonicalStudyReportProQuotation[] = [];
  for (const row of ledger) {
    for (const evidence of row.evidence) {
      quotes.push({
        claimRef: row.claimRef,
        sourceDocumentId: evidence.sourceDocumentId,
        page: evidence.page,
        quote: evidence.quote,
        fieldId: row.fieldId,
        recordTypeId: row.recordTypeId,
      });
    }
  }
  quotes.sort(
    (a, b) =>
      a.sourceDocumentId.localeCompare(b.sourceDocumentId) ||
      a.page - b.page ||
      a.quote.localeCompare(b.quote),
  );
  return quotes;
}

function buildProRelations(artifact: CanonicalStudyArtifact): CanonicalStudyReportProRelationRow[] {
  return [...artifact.relations]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((relation: CanonicalStudyRelation) => ({
      id: relation.id,
      label: relation.label,
      entityId: relation.entityId,
      fieldId: relation.fieldId,
      leftFieldKey: relation.left.fieldKey,
      rightFieldKey: relation.right.fieldKey,
      temporalBasis: relation.temporalBasis,
      partyBasis: relation.partyBasis,
    }));
}

function buildOperativeViews(
  artifact: CanonicalStudyArtifact,
): CanonicalStudyReportProOperativeView[] {
  return [...artifact.operativeViews]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((view) => ({
      id: view.id,
      baseDocumentTypeId: view.baseDocumentTypeId,
      baseSourceDocumentId: view.baseSourceDocumentId,
      status: view.status,
      recordCount: view.records.length,
      unresolvedItemIds: [...view.unresolvedItems].sort(),
    }));
}

function buildRequirements(artifact: CanonicalStudyArtifact): CanonicalStudyReportProRequirementRow[] {
  return [...artifact.requirements]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((row) => ({
      id: row.id,
      ruleId: row.ruleId,
      outcome: row.outcome,
      scope: row.scope,
      message: row.message,
      claimRefs: row.evidence.map((chip) =>
        claimRef(chip.fieldKey, { contextKind: "requirement", contextId: row.id }),
      ),
    }));
}

function buildFlags(artifact: CanonicalStudyArtifact): CanonicalStudyReportProFlagRow[] {
  return [...artifact.flags]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((row) => ({
      id: row.id,
      checkId: row.checkId,
      status: row.status,
      question: row.question,
      message: row.message,
      claimRefs: row.operands.map((chip) =>
        claimRef(chip.fieldKey, { contextKind: "flag", contextId: row.id }),
      ),
    }));
}

function buildSeries(artifact: CanonicalStudyArtifact): CanonicalStudyReportProSeriesRow[] {
  return [...artifact.series]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((row) => ({
      id: row.id,
      entityId: row.entityId,
      constructId: row.constructId,
      dimensionKey: row.dimensionKey,
      observationCount: row.observations.length,
      unresolvedReasons: [...row.unresolvedReasons],
      claimRefs: row.observations.flatMap((observation) => [
        claimRef(observation.provenance.fieldKey, {
          contextKind: "series_observation",
          contextId: row.id,
        }),
        ...observation.corroboratingProvenance.map((chip) =>
          claimRef(chip.fieldKey, { contextKind: "series_observation", contextId: row.id }),
        ),
      ]),
    }));
}

function buildExportTables(body: Omit<CanonicalStudyReportProBody, "exportTables">): CanonicalStudyReportProExportTable[] {
  const ledgerTable: CanonicalStudyReportProExportTable = {
    name: "entity_field_ledger",
    columns: [
      "entity_id",
      "entity_status",
      "record_type_id",
      "field_id",
      "instance_index",
      "source_document_id",
      "display_text",
      "assertion_kind",
      "field_key",
    ],
    rows: body.entityLedger.map((row) => [
      row.entityId ?? "",
      row.entityStatus ?? "",
      row.recordTypeId,
      row.fieldId,
      String(row.instanceIndex),
      row.sourceDocumentId,
      row.displayText,
      row.assertionKind,
      row.claimRef.fieldKey,
    ]),
  };

  const relationsTable: CanonicalStudyReportProExportTable = {
    name: "relations",
    columns: [
      "relation_id",
      "label",
      "entity_id",
      "field_id",
      "left_field_key",
      "right_field_key",
      "temporal_basis",
    ],
    rows: body.relations.map((row) => [
      row.id,
      row.label,
      row.entityId,
      row.fieldId,
      row.leftFieldKey,
      row.rightFieldKey,
      row.temporalBasis ?? "",
    ]),
  };

  return [ledgerTable, relationsTable];
}

function buildProBody(
  artifact: CanonicalStudyArtifact,
  chipIndex: Map<string, CanonicalStudyProvenanceChip>,
): CanonicalStudyReportProBody {
  const entityLedger = buildProLedger(artifact, chipIndex);
  const partial = {
    entityLedger,
    quotations: buildQuotations(entityLedger),
    relations: buildProRelations(artifact),
    operativeViews: buildOperativeViews(artifact),
    requirements: buildRequirements(artifact),
    flags: buildFlags(artifact),
    measurementSeries: buildSeries(artifact),
  };
  return {
    ...partial,
    exportTables: buildExportTables(partial),
  };
}

export function projectCanonicalStudyReport(
  input: ProjectCanonicalStudyReportInput,
): CanonicalStudyReportProjection {
  const chipIndex = indexProvenanceChips(input.artifact);
  const presentationMode = resolveCanonicalStudyReportPresentationMode(input);
  const meta = {
    schemaVersion: CANONICAL_STUDY_REPORT_PROJECTION_SCHEMA_VERSION,
    audience: input.audience,
    presentationMode,
    customerProReportsPermitted: input.customerProReportsPermitted,
    packApprovalLabel: input.packApprovalLabel,
    packId: input.artifact.packId,
    packVersion: input.artifact.packVersion,
    narrativeSource: "deterministic" as const,
    sourceArtifactContentSha256: input.artifact.contentSha256,
    studyRunId: input.artifact.studyRunId,
    caseId: input.artifact.caseId,
    uiTreeVersion: null,
  };

  const projection: CanonicalStudyReportProjection =
    input.audience === "customer"
      ? { ...meta, audience: "customer", body: buildCustomerBody(input.artifact, chipIndex) }
      : { ...meta, audience: "pro", body: buildProBody(input.artifact, chipIndex) };

  assertCanonicalStudyReportProjection(input.artifact, projection);
  return projection;
}
