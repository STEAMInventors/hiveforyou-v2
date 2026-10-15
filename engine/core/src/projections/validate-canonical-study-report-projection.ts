import type {
  CanonicalStudyArtifact,
  CanonicalStudyProvenanceChip,
  CanonicalStudyRecordVersion,
} from "@hiveforyou/shared/canonical-study-artifact";
import type {
  CanonicalStudyReportClaimRef,
  CanonicalStudyReportFactLine,
  CanonicalStudyReportProjection,
} from "@hiveforyou/shared/canonical-study-report-projection";

export class CanonicalStudyReportProjectionValidationError extends Error {
  readonly code = "CANONICAL_STUDY_REPORT_PROJECTION_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "CanonicalStudyReportProjectionValidationError";
  }
}

function walkChip(chip: CanonicalStudyProvenanceChip, index: Map<string, CanonicalStudyProvenanceChip>) {
  index.set(chip.fieldKey, chip);
}

/** Record versions list composite keys in fieldKeys but index provenance by fieldId. */
export function resolveProvenanceChipForRecordField(
  version: Pick<CanonicalStudyRecordVersion, "provenanceByFieldKey">,
  compositeFieldKey: string,
): CanonicalStudyProvenanceChip | undefined {
  const direct = version.provenanceByFieldKey[compositeFieldKey];
  if (direct) {
    return direct;
  }
  const lastPipe = compositeFieldKey.lastIndexOf("|");
  if (lastPipe >= 0) {
    const fieldId = compositeFieldKey.slice(lastPipe + 1);
    const byFieldId = version.provenanceByFieldKey[fieldId];
    if (byFieldId) {
      return byFieldId;
    }
  }
  return Object.values(version.provenanceByFieldKey).find(
    (chip) => chip.fieldKey === compositeFieldKey,
  );
}

function indexRecordVersionProvenance(
  version: CanonicalStudyRecordVersion,
  index: Map<string, CanonicalStudyProvenanceChip>,
): void {
  const indexedFieldKeys = new Set<string>();
  for (const compositeFieldKey of version.fieldKeys) {
    const chip = resolveProvenanceChipForRecordField(version, compositeFieldKey);
    if (chip && !indexedFieldKeys.has(chip.fieldKey)) {
      indexedFieldKeys.add(chip.fieldKey);
      walkChip(chip, index);
    }
  }
  for (const chip of Object.values(version.provenanceByFieldKey)) {
    if (!indexedFieldKeys.has(chip.fieldKey)) {
      indexedFieldKeys.add(chip.fieldKey);
      walkChip(chip, index);
    }
  }
}

export function indexProvenanceChips(
  artifact: CanonicalStudyArtifact,
): Map<string, CanonicalStudyProvenanceChip> {
  const index = new Map<string, CanonicalStudyProvenanceChip>();

  for (const entity of artifact.entities) {
    for (const version of entity.recordVersions) {
      indexRecordVersionProvenance(version, index);
    }
  }

  for (const relation of artifact.relations) {
    walkChip(relation.left, index);
    walkChip(relation.right, index);
  }

  for (const comparison of artifact.unresolvedComparisons) {
    walkChip(comparison.left, index);
    walkChip(comparison.right, index);
  }

  for (const flag of artifact.flags) {
    for (const chip of flag.operands) {
      walkChip(chip, index);
    }
  }

  for (const requirement of artifact.requirements) {
    for (const chip of requirement.evidence) {
      walkChip(chip, index);
    }
  }

  for (const series of artifact.series) {
    for (const observation of series.observations) {
      walkChip(observation.provenance, index);
      for (const chip of observation.corroboratingProvenance) {
        walkChip(chip, index);
      }
    }
  }

  for (const orphan of artifact.orphans) {
    for (const chip of orphan.provenance) {
      walkChip(chip, index);
    }
  }

  for (const link of artifact.possiblySameLinks) {
    for (const chip of link.leftProvenance) {
      walkChip(chip, index);
    }
    for (const chip of link.rightProvenance) {
      walkChip(chip, index);
    }
  }

  for (const view of artifact.operativeViews) {
    for (const record of view.records) {
      for (const field of record.fields) {
        if (field.provenance) {
          walkChip(field.provenance, index);
        }
        for (const chip of field.competingProvenance) {
          walkChip(chip, index);
        }
      }
    }
  }

  return index;
}

function assertClaimRefExists(
  chipIndex: Map<string, CanonicalStudyProvenanceChip>,
  ref: CanonicalStudyReportClaimRef,
): void {
  if (!chipIndex.has(ref.fieldKey)) {
    throw new CanonicalStudyReportProjectionValidationError(
      `Missing canonical claim for fieldKey ${ref.fieldKey}`,
    );
  }
}

function assertFactLine(
  chipIndex: Map<string, CanonicalStudyProvenanceChip>,
  line: CanonicalStudyReportFactLine,
): void {
  assertClaimRefExists(chipIndex, line.claimRef);
  if (line.evidence.length === 0) {
    throw new CanonicalStudyReportProjectionValidationError(
      `Fact line ${line.claimRef.fieldKey} is missing evidence chips`,
    );
  }
  for (const evidence of line.evidence) {
    assertClaimRefExists(chipIndex, evidence.claimRef);
    if (!evidence.quote.trim()) {
      throw new CanonicalStudyReportProjectionValidationError(
        `Evidence quote missing for ${line.claimRef.fieldKey}`,
      );
    }
  }
  const chip = chipIndex.get(line.claimRef.fieldKey);
  if (!chip) {
    return;
  }
  const provenanceClass = (chip.provenanceClass ?? "quoted").toLowerCase();
  if (provenanceClass === "classified" && line.assertionKind === "verified_quoted") {
    throw new CanonicalStudyReportProjectionValidationError(
      `Classified field promoted to verified quote: ${line.claimRef.fieldKey}`,
    );
  }
}

export function assertCanonicalStudyReportProjection(
  artifact: CanonicalStudyArtifact,
  projection: CanonicalStudyReportProjection,
): void {
  if (projection.sourceArtifactContentSha256 !== artifact.contentSha256) {
    throw new CanonicalStudyReportProjectionValidationError("Artifact content hash mismatch");
  }

  const chipIndex = indexProvenanceChips(artifact);

  if (projection.audience === "customer") {
    for (const section of projection.body.storySections) {
      for (const fact of section.facts) {
        assertFactLine(chipIndex, fact);
      }
    }
    for (const fact of projection.body.importantFacts) {
      assertFactLine(chipIndex, fact);
    }
    for (const change of projection.body.changes) {
      assertFactLine(chipIndex, change.left);
      assertFactLine(chipIndex, change.right);
    }
    for (const support of projection.body.supports) {
      assertFactLine(chipIndex, support.left);
      assertFactLine(chipIndex, support.right);
    }
    for (const question of projection.body.openQuestions) {
      for (const ref of question.claimRefs) {
        assertClaimRefExists(chipIndex, ref);
      }
    }
    return;
  }

  for (const row of projection.body.entityLedger) {
    assertFactLine(chipIndex, row);
  }
  for (const quote of projection.body.quotations) {
    assertClaimRefExists(chipIndex, quote.claimRef);
  }
  for (const relation of projection.body.relations) {
    assertClaimRefExists(chipIndex, { fieldKey: relation.leftFieldKey });
    assertClaimRefExists(chipIndex, { fieldKey: relation.rightFieldKey });
  }
  for (const row of projection.body.requirements) {
    for (const ref of row.claimRefs) {
      assertClaimRefExists(chipIndex, ref);
    }
  }
  for (const row of projection.body.flags) {
    for (const ref of row.claimRefs) {
      assertClaimRefExists(chipIndex, ref);
    }
  }
  for (const row of projection.body.measurementSeries) {
    for (const ref of row.claimRefs) {
      assertClaimRefExists(chipIndex, ref);
    }
  }
}
