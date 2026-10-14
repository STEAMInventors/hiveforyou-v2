import type { ProposalInsightCheck, ProposalInsightOperand } from "@hiveforyou/domain-pack";
import type {
  CanonicalStudyFlag,
  CanonicalStudyOperativeView,
  CanonicalStudyProvenanceChip,
  CanonicalStudySeries,
} from "@hiveforyou/shared/canonical-study-artifact";

import { buildConstructJoinKey, normalizedFieldValue } from "./construct-keys.js";
import {
  compareValuesPrimitive,
  elapsedSincePrimitive,
  evaluateExists,
} from "./evaluate-primitives.js";
import {
  evaluateInsightOperandSourceCoverage,
  evaluateScopeSourceCoverage,
  mergeSourceCoverageEvaluations,
} from "./evaluate-source-coverage.js";
import type { IndexedFoundation, IndexedRecordVersion } from "./indexed-foundation.js";
import { stableId } from "./stable-id.js";

const FULLY_SUPPORTED_PRIMITIVES = new Set([
  "exists",
  "compareValues",
  "elapsedSince",
  "series",
  "absenceOf",
]);

const PARTIAL_PRIMITIVES = new Set(["coChange", "periodCoverage", "ageOnDate"]);

function resolveSourceDocumentLabel(indexed: IndexedFoundation, sourceDocumentId: string): string {
  const match = indexed.sourceContext.logicalDocuments?.find(
    (doc) => doc.sourceDocumentId === sourceDocumentId,
  );
  if (match?.filename?.trim()) {
    return match.filename.replace(/\.[^.]+$/, "");
  }
  const docTypeId = indexed.records.find((r) => r.sourceDocumentId === sourceDocumentId)?.documentTypeId;
  const label = indexed.pack.documentTypes?.find((d) => d.id === docTypeId)?.label;
  return label ?? "A supplied document";
}

/** Returns null if any {placeholder} remains. */
function substituteQuestion(template: string, placeholders: Record<string, string>): string | null {
  let result = template;
  for (const [key, value] of Object.entries(placeholders)) {
    if (value === "") {
      continue;
    }
    result = result.replaceAll(`{${key}}`, value);
  }
  return /\{[a-zA-Z0-9_]+\}/.test(result) ? null : result;
}

function firedOrUnfilled(base: {
  check: { id: string; question?: string };
  operands: CanonicalStudyProvenanceChip[];
  message: string;
  placeholders: Record<string, string>;
  idSuffix?: string;
}): CanonicalStudyFlag {
  const question = substituteQuestion(base.check.question ?? "", base.placeholders);
  if (question == null) {
    return {
      id: stableId(`flag:${base.check.id}:unresolved${base.idSuffix ?? ""}`),
      checkId: base.check.id,
      status: "unresolved",
      question: base.check.question ?? "",
      operands: base.operands,
      message: "template_unfilled",
    };
  }
  return {
    id: stableId(`flag:${base.check.id}:fired${base.idSuffix ?? ""}`),
    checkId: base.check.id,
    status: "fired",
    question,
    operands: base.operands,
    message: base.message,
  };
}

function wholeYearsBetween(startIso: string, endIso: string): number {
  const [sy, sm, sd] = startIso.split("-").map(Number) as [number, number, number];
  const [ey, em, ed] = endIso.split("-").map(Number) as [number, number, number];
  return ey - sy - (em < sm || (em === sm && ed < sd) ? 1 : 0);
}

function asOfDateOperandChip(asOfDate: string): CanonicalStudyProvenanceChip {
  return {
    fieldKey: "as_of_date",
    recordGroupId: "as_of_date",
    sourceDocumentId: "",
    recordTypeId: "as_of_date",
    instanceIndex: 0,
    fieldId: "as_of_date",
    evidence: [],
    normalized: {
      valueKind: "date",
      displayValue: asOfDate,
      normalizedValue: asOfDate,
      unit: null,
    },
    envelopeRef: {
      studyRunId: "",
      attemptId: "",
      sourceDocumentId: "",
      envelopeStatus: "SUCCEEDED",
    },
  };
}

function resolveOperand(
  indexed: IndexedFoundation,
  operand: { record?: string; field?: string } | undefined,
): ReturnType<typeof evaluateExists>["chips"][0] | null {
  if (!operand?.record || !operand.field) {
    return null;
  }
  const result = evaluateExists(indexed, operand.record, operand.field);
  return result.chips[0] ?? null;
}

export function evaluateInsightChecks(input: {
  indexed: IndexedFoundation;
  operativeViews: CanonicalStudyOperativeView[];
  series: CanonicalStudySeries[];
}): CanonicalStudyFlag[] {
  const checks = input.indexed.pack.insightChecks?.checks ?? [];
  const declared = new Set(input.indexed.pack.insightChecks?.enginePrimitivesRequired ?? []);
  const flags: CanonicalStudyFlag[] = [];

  for (const check of checks) {
    const primitive = check.primitive;
    if (primitive === "coChange" || primitive === "periodCoverage" || primitive === "ageOnDate") {
      flags.push({
        id: stableId(`flag:${check.id}:unsupported`),
        checkId: check.id,
        status: "unsupported",
        question: check.question ?? "",
        operands: [],
        message: unsupportedInsightMessage(primitive),
      });
      continue;
    }

    if (PARTIAL_PRIMITIVES.has(primitive)) {
      flags.push({
        id: stableId(`flag:${check.id}:unsupported`),
        checkId: check.id,
        status: "unsupported",
        question: check.question ?? "",
        operands: [],
        message: `Primitive ${primitive} is not fully implemented; no positive finding emitted.`,
      });
      continue;
    }

    if (!FULLY_SUPPORTED_PRIMITIVES.has(primitive) || !declared.has(primitive)) {
      flags.push({
        id: stableId(`flag:${check.id}:unsupported`),
        checkId: check.id,
        status: "unsupported",
        question: check.question ?? "",
        operands: [],
        message: `Primitive ${primitive} is unsupported or undeclared.`,
      });
      continue;
    }

    if (primitive === "exists") {
      const operand = resolveOperand(input.indexed, check.left ?? check.present);
      if (!operand) {
        flags.push({
          id: stableId(`flag:${check.id}:unresolved`),
          checkId: check.id,
          status: "unresolved",
          question: check.question ?? "",
          operands: [],
          message: "missing_verified_operand",
        });
        continue;
      }
      flags.push(
        firedOrUnfilled({
          check,
          operands: [operand],
          message: "exists_verified",
          placeholders: { value: String(operand.normalized.displayValue ?? "") },
        }),
      );
      continue;
    }

    if (primitive === "compareValues") {
      const left = resolveOperand(input.indexed, check.left);
      const right = resolveOperand(input.indexed, check.right);
      const cmp = compareValuesPrimitive(left, right);
      if (!cmp.ok) {
        flags.push({
          id: stableId(`flag:${check.id}:unresolved`),
          checkId: check.id,
          status: "unresolved",
          question: check.question ?? "",
          operands: [left, right].filter(Boolean) as NonNullable<typeof left>[],
          message: cmp.reason,
        });
        continue;
      }
      const equal = (cmp.value as { equal: boolean }).equal;
      if (check.fires === "values_differ_with_compatible_units" && equal) {
        continue;
      }
      if (!left || !right) {
        continue;
      }
      flags.push(
        firedOrUnfilled({
          check,
          operands: [left, right],
          message: "compareValues_verified",
          placeholders: {
            left: String(left.normalized.displayValue ?? ""),
            right: String(right.normalized.displayValue ?? ""),
          },
        }),
      );
      continue;
    }

    if (primitive === "absenceOf") {
      flags.push(...evaluateAbsenceOf(input.indexed, input.operativeViews, check));
      continue;
    }

    if (primitive === "elapsedSince") {
      const fromOperand = operandField(check, "from");
      const toOperand = check.right ?? operandField(check, "to");
      let left = resolveOperand(input.indexed, check.left);
      let right = resolveOperand(input.indexed, toOperand);
      if (!left && fromOperand) {
        left = resolveFilteredOperand(input.indexed, input.operativeViews, fromOperand, null);
      }
      if (!right) {
        const asOfDate = input.indexed.sourceContext.asOfDate;
        if (typeof asOfDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
          flags.push({
            id: stableId(`flag:${check.id}:unresolved`),
            checkId: check.id,
            status: "unresolved",
            question: check.question ?? "",
            operands: left ? [left] : [],
            message: "missing_as_of_date",
          });
          continue;
        }
        right = asOfDateOperandChip(asOfDate);
      }
      const elapsed = elapsedSincePrimitive(left, right);
      if (!elapsed.ok || !left || !right) {
        flags.push({
          id: stableId(`flag:${check.id}:unresolved`),
          checkId: check.id,
          status: "unresolved",
          question: check.question ?? "",
          operands: [left, right].filter(Boolean) as NonNullable<typeof left>[],
          message: elapsed.ok ? "missing_operand" : elapsed.reason,
        });
        continue;
      }
      const startIso = String(left.normalized.normalizedValue ?? "");
      const endIso = String(right.normalized.normalizedValue ?? "");
      if (typeof check.atLeastYears === "number") {
        if (wholeYearsBetween(startIso, endIso) < check.atLeastYears) {
          continue;
        }
      }
      flags.push(
        firedOrUnfilled({
          check,
          operands: [left, right],
          message: "elapsedSince_verified",
          placeholders: { date: startIso },
        }),
      );
      continue;
    }

    if (primitive === "series") {
      const matching = input.series.filter((item) => item.observations.length >= 2);
      if (matching.length === 0) {
        flags.push({
          id: stableId(`flag:${check.id}:unresolved`),
          checkId: check.id,
          status: "unresolved",
          question: check.question ?? "",
          operands: [],
          message: "no_verified_series_with_two_observations",
        });
        continue;
      }
      const series = matching[0]!;
      const target = series.observations.find((o) => o.role === "target_value");
      flags.push(
        firedOrUnfilled({
          check,
          operands: series.observations.map((o) => o.provenance),
          message: "series_verified",
          placeholders: {
            target: target ? String(target.provenance.normalized.displayValue ?? "") : "",
          },
        }),
      );
    }
  }

  flags.sort((a, b) => a.id.localeCompare(b.id));
  return flags;
}

function unsupportedInsightMessage(primitive: string): string {
  if (primitive === "coChange") {
    return "coChange_semantics_incomplete:window,direction_comparator";
  }
  if (primitive === "periodCoverage") {
    return "periodCoverage_semantics_incomplete:operative_plan_period,frequency_expansion";
  }
  return `Primitive ${primitive} is not fully implemented; no positive finding emitted.`;
}

function operandField(check: ProposalInsightCheck, key: string): ProposalInsightOperand | undefined {
  const value = check[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as ProposalInsightOperand;
}

function evaluateAbsenceOf(
  indexed: IndexedFoundation,
  operativeViews: CanonicalStudyOperativeView[],
  check: ProposalInsightCheck,
): CanonicalStudyFlag[] {
  const present = check.present;
  const absent = check.absent;
  const unresolved = (message: string, operands: CanonicalStudyProvenanceChip[] = []): CanonicalStudyFlag => ({
    id: stableId(`flag:${check.id}:unresolved`),
    checkId: check.id,
    status: "unresolved",
    question: check.question ?? "",
    operands,
    message,
  });

  const presentField = present?.field;
  const absentField = absent?.field;
  const joinOn = check.joinOn;
  if (!present?.record || !presentField || !absent?.record || !absentField || !joinOn) {
    return [unresolved("absenceOf_operands_incomplete")];
  }

  const presentRecords = recordsInInsightScope(indexed, operativeViews, present, null).filter((record) =>
    recordMatchesWhere(record, present.where),
  );
  const presentChips = presentRecords
    .map((record) => record.provenanceByFieldKey[presentField])
    .filter((chip): chip is CanonicalStudyProvenanceChip => {
      if (!chip) {
        return false;
      }
      const value = chip.normalized.normalizedValue;
      return value != null && value !== "";
    });
  if (presentChips.length === 0) {
    const operandCoverage = mergeSourceCoverageEvaluations([
      evaluateInsightOperandSourceCoverage({
        indexed,
        operand: present,
        anchorSourceDocumentId: null,
        mode: "absence",
      }),
      evaluateInsightOperandSourceCoverage({
        indexed,
        operand: absent,
        anchorSourceDocumentId: null,
        mode: "absence",
      }),
    ]);
    if (!operandCoverage.complete) {
      return [unresolved(operandCoverage.message)];
    }
    return [unresolved("missing_present_operand")];
  }

  const unmatched: CanonicalStudyProvenanceChip[] = [];
  for (const record of presentRecords) {
    const chip = record.provenanceByFieldKey[presentField];
    const value = chip?.normalized.normalizedValue;
    if (!chip || value == null || value === "") {
      continue;
    }
    const presentKey = insightJoinKey(indexed, record, presentField, joinOn);
    if (!presentKey) {
      return [unresolved("join_key_unavailable", [chip])];
    }
    const absentRecords = recordsInInsightScope(indexed, operativeViews, absent, record.sourceDocumentId).filter(
      (candidate) => recordMatchesWhere(candidate, absent.where),
    );
    let matched = false;
    let blockingUnresolved = false;
    for (const candidate of absentRecords) {
      const joinState = joinFieldState(indexed, candidate, absentField);
      if (joinState === "verified") {
        const absentChip = candidate.provenanceByFieldKey[absentField]!;
        const absentKey = insightJoinKey(indexed, candidate, absentField, joinOn);
        if (!absentKey) {
          return [unresolved("join_key_unavailable", [chip, absentChip])];
        }
        if (absentKey === presentKey) {
          matched = true;
          break;
        }
        continue;
      }
      if (joinState === "missing" || joinState === "rejected") {
        blockingUnresolved = true;
      }
    }
    if (blockingUnresolved && !matched) {
      return [unresolved("absence_match_unresolved", [chip])];
    }
    if (!matched) {
      unmatched.push(chip);
    }
  }

  if (unmatched.length === 0) {
    return [];
  }

  const coverage = mergeSourceCoverageEvaluations([
    evaluateScopeSourceCoverage({
      indexed,
      scopeDocumentIds: new Set(
        presentRecords.map((record) => record.sourceDocumentId).concat(
          absent?.scope === "same_document"
            ? presentRecords.map((record) => record.sourceDocumentId)
            : [],
        ),
      ),
      appliesTo:
        present?.scope?.startsWith("operative:") || present?.scope?.startsWith("each:")
          ? present.scope
          : absent?.scope?.startsWith("operative:") || absent?.scope?.startsWith("each:")
            ? absent.scope
            : undefined,
      mode: "absence",
    }),
    evaluateInsightOperandSourceCoverage({
      indexed,
      operand: present,
      anchorSourceDocumentId: unmatched[0]?.sourceDocumentId ?? null,
      mode: "absence",
    }),
    evaluateInsightOperandSourceCoverage({
      indexed,
      operand: absent,
      anchorSourceDocumentId: unmatched[0]?.sourceDocumentId ?? null,
      mode: "absence",
    }),
  ]);
  if (!coverage.complete) {
    return [unresolved(coverage.message, unmatched)];
  }

  return unmatched
    .sort((a, b) => a.fieldKey.localeCompare(b.fieldKey))
    .map((chip) => {
      const value = String(chip.normalized.displayValue ?? "");
      return firedOrUnfilled({
        check,
        operands: [chip],
        message: "absenceOf_verified",
        idSuffix: `:${chip.fieldKey}`,
        placeholders: {
          area: value,
          accommodation: value,
          presentDocument: resolveSourceDocumentLabel(indexed, chip.sourceDocumentId),
        },
      });
    });
}

function recordsInInsightScope(
  indexed: IndexedFoundation,
  operativeViews: CanonicalStudyOperativeView[],
  operand: ProposalInsightOperand,
  anchorSourceDocumentId: string | null,
): IndexedRecordVersion[] {
  return indexed.records.filter((record) => {
    if (operand.record && record.recordTypeId !== operand.record) {
      return false;
    }
    const scope = operand.scope;
    if (!scope) {
      return true;
    }
    if (scope === "same_document") {
      return anchorSourceDocumentId == null || record.sourceDocumentId === anchorSourceDocumentId;
    }
    if (scope.startsWith("operative:")) {
      const docType = scope.slice("operative:".length);
      const view = operativeViews.find((item) => item.baseDocumentTypeId === docType);
      if (!view) {
        return false;
      }
      const ids = new Set([view.baseSourceDocumentId, ...view.amendmentSourceDocumentIds]);
      return ids.has(record.sourceDocumentId);
    }
    return true;
  });
}

function recordMatchesWhere(record: IndexedRecordVersion, where: Record<string, unknown> | undefined): boolean {
  if (!where) {
    return true;
  }
  for (const [key, expected] of Object.entries(where)) {
    if (key === "documentType") {
      const types = Array.isArray(expected) ? expected.map(String) : [String(expected)];
      if (!record.documentTypeId || !types.includes(record.documentTypeId)) {
        return false;
      }
      continue;
    }
    const chip = record.provenanceByFieldKey[key];
    if (!chip) {
      return false;
    }
    const value = String(chip.normalized.normalizedValue ?? "");
    if (Array.isArray(expected)) {
      if (!expected.map(String).includes(value)) {
        return false;
      }
    } else if (value !== String(expected)) {
      return false;
    }
  }
  return true;
}

function joinFieldState(
  indexed: IndexedFoundation,
  record: IndexedRecordVersion,
  fieldId: string,
): "verified" | "empty" | "rejected" | "missing" {
  const chip = record.provenanceByFieldKey[fieldId];
  if (chip) {
    const value = chip.normalized.normalizedValue;
    if (value == null || value === "") {
      return "empty";
    }
    return "verified";
  }
  const rejected = indexed.foundation.rejectedFields.some(
    (field) =>
      field.sourceDocumentId === record.sourceDocumentId &&
      field.recordTypeId === record.recordTypeId &&
      field.instanceIndex === record.instanceIndex &&
      field.fieldId === fieldId,
  );
  return rejected ? "rejected" : "missing";
}

function insightJoinKey(
  indexed: IndexedFoundation,
  record: IndexedRecordVersion,
  fieldId: string,
  joinOn: string,
): string | null {
  if (joinOn === "area_normalized") {
    return normalizedFieldValue(record, "area", indexed.pack);
  }
  if (joinOn === "text_normalized") {
    return normalizedFieldValue(record, fieldId, indexed.pack);
  }
  if (indexed.pack.constructs?.[joinOn]) {
    return buildConstructJoinKey(record, joinOn, indexed.pack);
  }
  return null;
}

function resolveFilteredOperand(
  indexed: IndexedFoundation,
  operativeViews: CanonicalStudyOperativeView[],
  operand: ProposalInsightOperand,
  anchorSourceDocumentId: string | null,
): CanonicalStudyProvenanceChip | null {
  if (!operand.record || !operand.field) {
    return null;
  }
  const matches = recordsInInsightScope(indexed, operativeViews, operand, anchorSourceDocumentId)
    .filter((record) => recordMatchesWhere(record, operand.where))
    .map((record) => record.provenanceByFieldKey[operand.field!])
    .filter((chip): chip is CanonicalStudyProvenanceChip => {
      if (!chip) {
        return false;
      }
      const value = chip.normalized.normalizedValue;
      return value != null && value !== "";
    })
    .sort((a, b) => {
      if (operand.pick === "latest") {
        return String(b.normalized.normalizedValue).localeCompare(String(a.normalized.normalizedValue));
      }
      return a.fieldKey.localeCompare(b.fieldKey);
    });
  return matches[0] ?? null;
}
