import type { CanonicalStudyProvenanceChip } from "@hiveforyou/shared/canonical-study-artifact";

import { buildConstructJoinKey, normalizedFieldValue } from "./construct-keys.js";
import type { IndexedFoundation, IndexedRecordVersion } from "./indexed-foundation.js";
import { resolveRelationshipRules } from "./indexed-foundation.js";
import { temporalDateForRecord } from "./temporal-succession.js";

export function isMatchEligible(input: {
  indexed: IndexedFoundation;
  leftVersion: IndexedRecordVersion;
  rightVersion: IndexedRecordVersion;
  left: CanonicalStudyProvenanceChip;
  right: CanonicalStudyProvenanceChip;
  fieldId: string;
  recordTypeId: string;
}): boolean {
  const rules = resolveRelationshipRules(input.indexed.pack);
  const policy = rules.matchingPolicyByFieldId[input.fieldId];
  const required = policy?.requiredDimensions ?? [];
  if (required.length === 0) {
    return true;
  }

  const recordDef = input.indexed.pack.recordTypes.find((record) => record.id === input.recordTypeId);
  const constructId = recordDef?.usesConstructs?.[0];

  if (required.includes("construct") && constructId) {
    const leftKey = buildConstructJoinKey(input.leftVersion, constructId, input.indexed.pack);
    const rightKey = buildConstructJoinKey(input.rightVersion, constructId, input.indexed.pack);
    if (leftKey == null || rightKey == null || leftKey !== rightKey) {
      return false;
    }
  }

  if (required.includes("temporal")) {
    const leftDate = temporalDateForRecord(input.leftVersion, input.indexed);
    const rightDate = temporalDateForRecord(input.rightVersion, input.indexed);
    if (leftDate && rightDate && leftDate !== rightDate) {
      return false;
    }
  }

  if (required.includes("unit")) {
    if (input.left.normalized.unit !== input.right.normalized.unit) {
      return false;
    }
  }

  if (required.includes("context") && constructId) {
    const construct = input.indexed.pack.constructs?.[constructId];
    for (const fieldSuffix of construct?.comparedIfBothPresent ?? []) {
      const contextFieldId = `${constructId}.${fieldSuffix}`;
      const leftVal = normalizedFieldValue(input.leftVersion, contextFieldId, input.indexed.pack, constructId);
      const rightVal = normalizedFieldValue(input.rightVersion, contextFieldId, input.indexed.pack, constructId);
      if (leftVal != null && rightVal != null && leftVal !== rightVal) {
        return false;
      }
    }
  }

  if (required.includes("subject")) {
    const leftSubject = input.leftVersion.provenanceByFieldKey.student_id ?? input.leftVersion.provenanceByFieldKey.name;
    const rightSubject = input.rightVersion.provenanceByFieldKey.student_id ?? input.rightVersion.provenanceByFieldKey.name;
    if (leftSubject && rightSubject) {
      const leftVal = JSON.stringify(leftSubject.normalized.normalizedValue);
      const rightVal = JSON.stringify(rightSubject.normalized.normalizedValue);
      if (leftVal !== rightVal) {
        return false;
      }
    }
  }

  return true;
}
