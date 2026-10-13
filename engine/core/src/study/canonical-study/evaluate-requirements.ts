import type {
  CanonicalStudyOperativeView,
  CanonicalStudyRequirementFieldResult,
  CanonicalStudyRequirementOutcome,
  CanonicalStudyRequirementResult,
} from "@hiveforyou/shared/canonical-study-artifact";

import { evaluateWhenClause, evaluateExists } from "./evaluate-primitives.js";
import {
  evaluateScopeSourceCoverage,
  type SourceCoverageGateMode,
} from "./evaluate-source-coverage.js";
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

function unresolvedForIncompleteCoverage(input: {
  indexed: IndexedFoundation;
  scopeDocumentIds: Set<string>;
  appliesTo?: string;
  mode?: SourceCoverageGateMode;
}): { outcome: CanonicalStudyRequirementOutcome; evidence: []; message: string } | null {
  const coverage = evaluateScopeSourceCoverage(input);
  if (coverage.complete) {
    return null;
  }
  return {
    outcome: "UNRESOLVED",
    evidence: [],
    message: coverage.message,
  };
}

function aggregateFieldResults(
  indexed: IndexedFoundation,
  matchingRecords: IndexedFoundation["records"],
  fieldIds: string[],
): CanonicalStudyRequirementFieldResult[] {
  const results = new Map<string, CanonicalStudyRequirementFieldResult["status"]>();
  for (const fieldId of fieldIds) {
    results.set(fieldId, "missing");
  }
  for (const record of matchingRecords) {
    for (const fieldId of fieldIds) {
      const state = fieldState(indexed, record, fieldId);
      const current = results.get(fieldId) ?? "missing";
      if (state.kind === "verified") {
        results.set(fieldId, "verified");
        continue;
      }
      if (current === "verified") {
        continue;
      }
      if (state.kind === "rejected") {
        results.set(fieldId, "rejected");
        continue;
      }
      if (state.kind === "empty" && current === "missing") {
        results.set(fieldId, "empty");
      }
    }
  }
  return [...results.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([fieldId, status]) => ({ fieldId, status }));
}

function evaluateCheck(input: {
  indexed: IndexedFoundation;
  recordTypeId: string;
  fieldIds: string[];
  scopeDocumentIds: Set<string>;
  minCount?: number;
  forEach?: boolean;
  pageTerms?: string[];
  appliesTo?: string;
}): {
  outcome: CanonicalStudyRequirementOutcome;
  evidence: ReturnType<typeof evaluateExists>["chips"];
  fieldResults?: CanonicalStudyRequirementFieldResult[];
  message: string;
} {
  const coverageBlocked = unresolvedForIncompleteCoverage({
    indexed: input.indexed,
    scopeDocumentIds: input.scopeDocumentIds,
    appliesTo: input.appliesTo,
  });
  if (coverageBlocked) {
    return coverageBlocked;
  }

  const matchingRecords = input.indexed.records.filter(
    (record) =>
      record.recordTypeId === input.recordTypeId && input.scopeDocumentIds.has(record.sourceDocumentId),
  );

  if (matchingRecords.length === 0) {
    return absenceAfterPageReview(input);
  }

  if (input.fieldIds.length === 0) {
    const requiredCount = input.minCount ?? 1;
    if (matchingRecords.length >= requiredCount) {
      return { outcome: "PRESENT", evidence: [], message: "presence_check_only:verified" };
    }
    return absenceAfterPageReview(input);
  }

  const evidence = [];
  const missing = new Set<string>();
  const rejected = new Set<string>();
  const empty = new Set<string>();
  let completeRecords = 0;

  for (const record of matchingRecords) {
    let complete = true;
    for (const fieldId of input.fieldIds) {
      const state = fieldState(input.indexed, record, fieldId);
      if (state.kind === "verified") {
        evidence.push(state.chip);
        continue;
      }
      complete = false;
      if (state.kind === "empty") {
        empty.add(fieldId);
      } else if (state.kind === "rejected") {
        rejected.add(fieldId);
      } else {
        missing.add(fieldId);
      }
    }
    if (complete) {
      completeRecords += 1;
    }
  }

  evidence.sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));
  const requiredCount = input.forEach ? matchingRecords.length : (input.minCount ?? 1);
  const fieldResults =
    input.fieldIds.length > 0
      ? aggregateFieldResults(input.indexed, matchingRecords, input.fieldIds)
      : undefined;
  if (completeRecords >= requiredCount && completeRecords > 0) {
    return { outcome: "PRESENT", evidence, fieldResults, message: "presence_check_only:verified" };
  }
  if (rejected.size > 0) {
    return {
      outcome: "UNRESOLVED",
      evidence,
      fieldResults,
      message: `presence_check_only:verification_rejected:${[...rejected].sort().join(",")}`,
    };
  }
  if (evidence.length > 0 && matchingRecords.length > 0 && (missing.size > 0 || empty.size > 0)) {
    const partialFields = [...missing, ...empty].sort();
    return {
      outcome: "PRESENT_WITH_MISSING_FIELDS",
      evidence,
      fieldResults,
      message: `presence_check_only:partially_verified:${partialFields.join(",")}`,
    };
  }
  if (missing.size > 0) {
    return {
      outcome: "UNRESOLVED",
      evidence,
      fieldResults,
      message: `presence_check_only:explicitly_missing:${[...missing].sort().join(",")}`,
    };
  }
  if (empty.size > 0) {
    return {
      outcome: "FIELD_PRESENT_BUT_EMPTY",
      evidence,
      fieldResults,
      message: `presence_check_only:explicitly_empty:${[...empty].sort().join(",")}`,
    };
  }
  return absenceAfterPageReview({ ...input, evidence, fieldResults });
}

function fieldState(
  indexed: IndexedFoundation,
  record: IndexedFoundation["records"][number],
  fieldId: string,
):
  | { kind: "verified"; chip: ReturnType<typeof evaluateExists>["chips"][number] }
  | { kind: "empty" | "rejected" | "missing" } {
  const chip = record.provenanceByFieldKey[fieldId];
  if (chip) {
    const value = chip.normalized.normalizedValue;
    if (value == null || value === "") {
      return { kind: "empty" };
    }
    return { kind: "verified", chip };
  }
  const rejected = indexed.foundation.rejectedFields.some(
    (field) =>
      field.sourceDocumentId === record.sourceDocumentId &&
      field.recordTypeId === record.recordTypeId &&
      field.instanceIndex === record.instanceIndex &&
      field.fieldId === fieldId,
  );
  return { kind: rejected ? "rejected" : "missing" };
}

function absenceAfterPageReview(input: {
  indexed: IndexedFoundation;
  recordTypeId: string;
  scopeDocumentIds: Set<string>;
  pageTerms?: string[];
  appliesTo?: string;
  evidence?: ReturnType<typeof evaluateExists>["chips"];
  fieldResults?: CanonicalStudyRequirementFieldResult[];
}): {
  outcome: CanonicalStudyRequirementOutcome;
  evidence: ReturnType<typeof evaluateExists>["chips"];
  fieldResults?: CanonicalStudyRequirementFieldResult[];
  message: string;
} {
  const coverageBlocked = unresolvedForIncompleteCoverage({
    indexed: input.indexed,
    scopeDocumentIds: input.scopeDocumentIds,
    appliesTo: input.appliesTo,
    mode: "absence",
  });
  if (coverageBlocked) {
    return { ...coverageBlocked, evidence: input.evidence ?? [], fieldResults: input.fieldResults };
  }

  const documents = input.indexed.foundation.documents.filter((document) => {
    if (input.scopeDocumentIds.size > 0) {
      return input.scopeDocumentIds.has(document.sourceDocumentId);
    }
    if (input.appliesTo?.startsWith("operative:") || input.appliesTo?.startsWith("each:")) {
      const typeId = input.appliesTo.slice(input.appliesTo.indexOf(":") + 1);
      return document.documentTypeId === typeId;
    }
    return true;
  });

  if (documents.length === 0 || documents.some((document) => !document.trustedPagesSupplied)) {
    return {
      outcome: "UNRESOLVED",
      evidence: input.evidence ?? [],
      message: "presence_check_only:source_pages_unavailable",
    };
  }

  const hits = (input.pageTerms ?? []).filter((term) =>
    documents.some((document) => document.matchedPageTerms.includes(term)),
  );
  if (hits.length > 0) {
    return {
      outcome: "UNRESOLVED",
      evidence: input.evidence ?? [],
      message: `presence_check_only:source_page_mentions_unverified:${hits.sort().join(",")}`,
    };
  }

  return {
    outcome: "NOT_FOUND_IN_SUPPLIED_DOCUMENTS",
    evidence: input.evidence ?? [],
    message: "presence_check_only:not_found_after_page_review",
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
        forEach: check.forEach,
        pageTerms: check.pageTerms,
        appliesTo: rule.appliesTo,
      });
      results.push({
        id: stableId(`requirement:${rule.id}:${check.record}:${(check.fields ?? []).join(",")}`),
        ruleId: rule.id,
        outcome: evaluated.outcome,
        scope: rule.appliesTo ?? "",
        evidence: evaluated.evidence,
        fieldResults: evaluated.fieldResults,
        message: evaluated.message,
      });
    }
  }

  results.sort((a, b) => a.id.localeCompare(b.id));
  return results;
}
