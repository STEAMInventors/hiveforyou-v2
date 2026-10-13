import type {
  CanonicalStudyFlag,
  CanonicalStudyOperativeView,
  CanonicalStudySeries,
} from "@hiveforyou/shared/canonical-study-artifact";

import {
  compareValuesPrimitive,
  elapsedSincePrimitive,
  evaluateExists,
} from "./evaluate-primitives.js";
import type { IndexedFoundation } from "./indexed-foundation.js";
import { stableId } from "./stable-id.js";

const FULLY_SUPPORTED_PRIMITIVES = new Set([
  "exists",
  "compareValues",
  "elapsedSince",
  "series",
]);

const PARTIAL_PRIMITIVES = new Set(["absenceOf", "coChange", "periodCoverage", "ageOnDate"]);

function substituteQuestion(
  template: string,
  placeholders: Record<string, string>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(placeholders)) {
    result = result.replaceAll(`{${key}}`, value);
  }
  if (/\{[a-zA-Z0-9_]+\}/.test(result)) {
    return result;
  }
  return result;
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
      flags.push({
        id: stableId(`flag:${check.id}:fired`),
        checkId: check.id,
        status: "fired",
        question: substituteQuestion(check.question ?? "", { value: String(operand.normalized.displayValue ?? "") }),
        operands: [operand],
        message: "exists_verified",
      });
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
      flags.push({
        id: stableId(`flag:${check.id}:fired`),
        checkId: check.id,
        status: "fired",
        question: substituteQuestion(check.question ?? "", {
          left: String(left.normalized.displayValue ?? ""),
          right: String(right.normalized.displayValue ?? ""),
        }),
        operands: [left, right],
        message: "compareValues_verified",
      });
      continue;
    }

    if (primitive === "elapsedSince") {
      const left = resolveOperand(input.indexed, check.left);
      const right = resolveOperand(input.indexed, check.right);
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
      flags.push({
        id: stableId(`flag:${check.id}:fired`),
        checkId: check.id,
        status: "fired",
        question: check.question ?? "",
        operands: [left, right],
        message: "elapsedSince_verified",
      });
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
      const operands = matching[0]!.observations.map((observation) => observation.provenance);
      flags.push({
        id: stableId(`flag:${check.id}:fired`),
        checkId: check.id,
        status: "fired",
        question: check.question ?? "",
        operands,
        message: "series_verified",
      });
    }
  }

  flags.sort((a, b) => a.id.localeCompare(b.id));
  return flags;
}
