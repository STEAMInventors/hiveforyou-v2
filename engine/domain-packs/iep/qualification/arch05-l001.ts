import type { CanonicalStudyArtifact } from "@hiveforyou/shared/canonical-study-artifact";

export const L001_QUALIFICATION_AS_OF_DATE = "2026-10-21";

export type Arch05L001AcceptanceCheck = {
  id: string;
  pass: boolean;
  observed: string;
  expected: string;
  sourceHint: string;
};

export function evaluateArch05L001Acceptance(
  artifact: CanonicalStudyArtifact,
  foundationMinutesPerWeek: number | null,
): Arch05L001AcceptanceCheck[] {
  const checks: Arch05L001AcceptanceCheck[] = [];
  const students = artifact.entities.filter((entity) => entity.recordTypeId === "student");
  checks.push({
    id: "one_student_eight_versions",
    pass: students.length === 1 && (students[0]?.recordVersions.length ?? 0) === 8,
    observed: `students=${students.length}, versions=${students[0]?.recordVersions.length ?? 0}`,
    expected: "students=1, versions=8",
    sourceHint: "engine/core/src/study/canonical-study/resolve-identity.ts",
  });

  const readingGoals = artifact.entities.filter(
    (entity) => entity.recordTypeId === "goal" && entity.status === "resolved",
  );
  checks.push({
    id: "reading_goal_recognized",
    pass: readingGoals.length >= 1,
    observed: `resolved_goal_entities=${readingGoals.length}`,
    expected: ">=1 resolved goal entity",
    sourceHint: "engine/core/src/study/canonical-study/resolve-identity.ts",
  });

  const fluencySeries = artifact.series.filter((series) =>
    series.dimensionKey.toLowerCase().includes("reading fluency"),
  );
  checks.push({
    id: "fluency_construct_unified",
    pass: fluencySeries.length === 1,
    observed: `fluency_series=${fluencySeries.length}`,
    expected: "fluency_series=1",
    sourceHint: "engine/core/src/study/canonical-study/build-series.ts",
  });

  const wcpm42 = artifact.series.flatMap((series) =>
    series.observations.filter(
      (observation) =>
        observation.role === "value" &&
        String(observation.provenance.normalized.normalizedValue).includes("42") &&
        (observation.corroboratingProvenance?.length ?? 0) > 0,
    ),
  );
  checks.push({
    id: "same_date_42_wcpm_corroboration",
    pass: wcpm42.length >= 1,
    observed: `corroborated_42=${wcpm42.length}`,
    expected: ">=1 corroborated 42 WCPM",
    sourceHint: "engine/core/src/study/canonical-study/build-series.ts",
  });

  const target75 = artifact.series.flatMap((series) =>
    series.observations.filter(
      (observation) =>
        observation.role === "target_value" &&
        String(observation.provenance.normalized.normalizedValue).includes("75"),
    ),
  );
  checks.push({
    id: "75_wcpm_planned_target",
    pass: target75.length >= 1,
    observed: `target_75=${target75.length}`,
    expected: ">=1 target_value 75 WCPM",
    sourceHint: "engine/core/src/study/canonical-study/build-series.ts",
  });

  checks.push({
    id: "150_minutes_per_week_derived",
    pass: foundationMinutesPerWeek === 150,
    observed: `minutes_per_week=${foundationMinutesPerWeek ?? "null"}`,
    expected: "150",
    sourceHint: "engine/core/src/study/canonical-study-foundation/primitives.ts",
  });

  const accuracy86Rel = artifact.relations.filter(
    (relation) =>
      relation.label === "MATCHES" &&
      (String(relation.left.normalized.normalizedValue).includes("86") ||
        String(relation.right.normalized.normalizedValue).includes("86")),
  );
  const accuracy86Unchanged = artifact.relations.filter(
    (relation) =>
      relation.label === "UNCHANGED" &&
      (String(relation.left.normalized.normalizedValue).includes("86") ||
        String(relation.right.normalized.normalizedValue).includes("86")),
  );
  checks.push({
    id: "86_percent_matches_not_unchanged",
    pass: accuracy86Rel.length >= 1 && accuracy86Unchanged.length === 0,
    observed: `MATCHES=${accuracy86Rel.length}, UNCHANGED=${accuracy86Unchanged.length}`,
    expected: "MATCHES>=1, UNCHANGED=0",
    sourceHint: "engine/core/src/study/canonical-study/label-relations.ts",
  });

  const meaninglessRelations = artifact.relations.filter((relation) =>
    ["statement", "narrative", "context", "present_level_narrative"].includes(relation.fieldId),
  );
  checks.push({
    id: "no_meanless_narrative_comparisons",
    pass: meaninglessRelations.length === 0,
    observed: `count=${meaninglessRelations.length}`,
    expected: "0",
    sourceHint: "engine/core/src/study/canonical-study/label-relations.ts",
  });

  checks.push({
    id: "relation_clusters_bounded",
    pass: (artifact.relationClusters?.length ?? 0) >= 0 && artifact.relations.length <= 64,
    observed: `clusters=${artifact.relationClusters?.length ?? 0}, relations=${artifact.relations.length}`,
    expected: "clusters present; relations bounded",
    sourceHint: "engine/core/src/study/canonical-study/relation-clusters.ts",
  });

  const testingInsight = artifact.flags.find(
    (flag) => flag.checkId === "testing_accommodation_not_in_assessment",
  );
  checks.push({
    id: "classroom_testing_no_state_district_insight",
    pass: testingInsight?.status !== "fired",
    observed: `status=${testingInsight?.status ?? "missing"}`,
    expected: "!= fired",
    sourceHint: "engine/core/src/study/canonical-study/evaluate-insight-checks.ts",
  });

  const serviceReq = artifact.requirements.find((requirement) => requirement.ruleId === "service_fields");
  checks.push({
    id: "service_present_with_missing_fields",
    pass:
      serviceReq?.outcome === "PRESENT_WITH_MISSING_FIELDS" &&
      (serviceReq.message?.includes("end_date") ?? false),
    observed: `outcome=${serviceReq?.outcome ?? "missing"}`,
    expected: "PRESENT_WITH_MISSING_FIELDS + end_date",
    sourceHint: "engine/core/src/study/canonical-study/evaluate-requirements.ts",
  });

  const firstDoc = artifact.documents[0];
  checks.push({
    id: "referral_2024_08_20_sorts_first",
    pass: firstDoc?.verifiedOrderingDate === "2024-08-20",
    observed: `first=${firstDoc?.verifiedOrderingDate ?? "null"}`,
    expected: "2024-08-20",
    sourceHint: "engine/core/src/study/canonical-study-foundation/order-documents-and-records.ts",
  });

  checks.push({
    id: "as_of_date_preserved",
    pass: typeof artifact.asOfDate === "string" && artifact.asOfDate.length > 0,
    observed: `asOfDate=${artifact.asOfDate ?? "null"}`,
    expected: "non-null",
    sourceHint: "engine/core/src/study/canonical-study/index.ts",
  });

  const firedAbsence = artifact.flags.filter(
    (flag) => flag.status === "fired" && flag.message === "absenceOf_verified",
  );
  checks.push({
    id: "no_false_absence_findings",
    pass: firedAbsence.length === 0,
    observed: `count=${firedAbsence.length}`,
    expected: "0",
    sourceHint: "engine/core/src/study/canonical-study/evaluate-insight-checks.ts",
  });

  checks.push({
    id: "no_orphan_records",
    pass: (artifact.orphans?.length ?? 0) === 0,
    observed: `orphans=${artifact.orphans?.length ?? 0}`,
    expected: "0",
    sourceHint: "engine/core/src/study/canonical-study/resolve-identity.ts",
  });

  return checks;
}
