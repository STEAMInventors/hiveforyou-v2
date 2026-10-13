import type {
  CanonicalStudyOperativeView,
  CanonicalStudyRequirementOutcome,
  CanonicalStudyRequirementResult,
} from "@hiveforyou/shared/canonical-study-artifact";

import { evaluateWhenClause, evaluateExists } from "./evaluate-primitives.js";
import type { IndexedFoundation } from "./indexed-foundation.js";
import { stableId } from "./stable-id.js";

function recordsInScope(
  indexed: IndexedFoundation,
  operativeViews: CanonicalStudyOperativeView[],
  appliesTo: string | undefined,
): { sourceDocumentIds: Set<string>; operativeView: CanonicalStudyOperativeView | null } {
  if (!appliesTo) {
    return { sourceDocumentIds: new Set(indexed.records.map((record) => record.sourceDocumentId)), operativeView: null };
  }

  if (appliesTo.startsWith("operative:")) {
    const docTypeId = appliesTo.slice("operative:".length);
    const view = operativeViews.find((item) => item.baseDocumentTypeId === docTypeId) ?? operativeViews[0] ?? null;
    if (!view) {
      return { sourceDocumentIds: new Set(), operativeView: null };
    }
    const ids = new Set<string>([view.baseSourceDocumentId, ...view.amendmentSourceDocumentIds]);
    return { sourceDocumentIds: ids, operativeView: view };
  }

  if (appliesTo.startsWith("each:")) {
    const docTypeId = appliesTo.slice("each:".length);
    const ids = new Set(
      indexed.records
        .filter((record) => record.documentTypeId === docTypeId)
        .map((record) => record.sourceDocumentId),
    );
    return { sourceDocumentIds: ids, operativeView: null };
  }

  return { sourceDocumentIds: new Set(), operativeView: null };
}

function evaluateCheck(input: {
  indexed: IndexedFoundation;
  recordTypeId: string;
  fieldIds: string[];
  scopeDocumentIds: Set<string>;
  minCount?: number;
}): { outcome: CanonicalStudyRequirementOutcome; evidence: ReturnType<typeof evaluateExists>["chips"]; message: string } {
  const matchingRecords = input.indexed.records.filter(
    (record) =>
      record.recordTypeId === input.recordTypeId && input.scopeDocumentIds.has(record.sourceDocumentId),
  );

  if (matchingRecords.length === 0) {
    return {
      outcome: "NOT_FOUND_IN_SUPPLIED_DOCUMENTS",
      evidence: [],
      message: `No ${input.recordTypeId} records in scope.`,
    };
  }

  const evidence = [];
  let emptyPresent = false;
  for (const record of matchingRecords) {
    for (const fieldId of input.fieldIds) {
      const chip = record.provenanceByFieldKey[fieldId];
      if (!chip) {
        continue;
      }
      const value = chip.normalized.normalizedValue;
      if (value == null || value === "") {
        emptyPresent = true;
      } else {
        evidence.push(chip);
      }
    }
  }

  evidence.sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));

  const requiredCount = input.minCount ?? 1;
  if (evidence.length >= requiredCount) {
    return { outcome: "PRESENT", evidence, message: "Verified evidence found." };
  }
  if (emptyPresent) {
    return { outcome: "FIELD_PRESENT_BUT_EMPTY", evidence, message: "Field present but explicitly empty." };
  }
  return {
    outcome: "NOT_FOUND_IN_SUPPLIED_DOCUMENTS",
    evidence,
    message: "Required verified evidence not found in supplied documents.",
  };
}

export function evaluateRequirements(input: {
  indexed: IndexedFoundation;
  operativeViews: CanonicalStudyOperativeView[];
}): CanonicalStudyRequirementResult[] {
  const rules = input.indexed.pack.requirements?.rules ?? [];
  const results: CanonicalStudyRequirementResult[] = [];

  for (const rule of rules) {
    const whenResult = evaluateWhenClause(rule.when, input.indexed, input.indexed.sourceContext);
    if (!whenResult.ok && whenResult.reason === "applicability_false") {
      results.push({
        id: stableId(`requirement:${rule.id}:na`),
        ruleId: rule.id,
        outcome: "NOT_APPLICABLE",
        scope: rule.appliesTo ?? "",
        evidence: [],
        message: "Applicability condition verified false.",
      });
      continue;
    }
    if (!whenResult.ok) {
      results.push({
        id: stableId(`requirement:${rule.id}:unresolved`),
        ruleId: rule.id,
        outcome: "UNRESOLVED",
        scope: rule.appliesTo ?? "",
        evidence: [],
        message: whenResult.reason,
      });
      continue;
    }

    const scope = recordsInScope(input.indexed, input.operativeViews, rule.appliesTo);
    if (scope.sourceDocumentIds.size === 0 && rule.appliesTo?.startsWith("operative:")) {
      results.push({
        id: stableId(`requirement:${rule.id}:na`),
        ruleId: rule.id,
        outcome: "NOT_APPLICABLE",
        scope: rule.appliesTo ?? "",
        evidence: [],
        message: "No operative view for declared scope.",
      });
      continue;
    }

    for (const check of rule.checks ?? []) {
      const evaluated = evaluateCheck({
        indexed: input.indexed,
        recordTypeId: check.record,
        fieldIds: check.fields ?? [],
        scopeDocumentIds: scope.sourceDocumentIds,
        minCount: check.minCount,
      });
      results.push({
        id: stableId(`requirement:${rule.id}:${check.record}:${(check.fields ?? []).join(",")}`),
        ruleId: rule.id,
        outcome: evaluated.outcome,
        scope: rule.appliesTo ?? "",
        evidence: evaluated.evidence,
        message: evaluated.message,
      });
    }
  }

  results.sort((a, b) => a.id.localeCompare(b.id));
  return results;
}
