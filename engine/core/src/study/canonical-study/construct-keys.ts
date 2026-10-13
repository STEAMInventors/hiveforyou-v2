import type { ProposalConstruct, ProposalDomainPack } from "@hiveforyou/domain-pack";

import type { IndexedRecordVersion } from "./indexed-foundation.js";

function normalizeText(value: unknown, steps: string[] | undefined, pack: ProposalDomainPack): string {
  let text = String(value ?? "").trim();
  for (const step of steps ?? []) {
    if (step === "lowercase") {
      text = text.toLowerCase();
    } else if (step === "trim_punctuation") {
      text = text.replace(/^[^\w]+|[^\w]+$/g, "");
    } else if (step === "vocabulary_synonyms") {
      for (const entry of pack.vocabulary?.fieldSynonyms ?? []) {
        for (const synonym of entry.synonyms) {
          if (text === synonym.toLowerCase()) {
            text = entry.field.split(".").pop()?.toLowerCase() ?? text;
          }
        }
      }
    }
  }
  return text;
}

export function normalizedFieldValue(
  record: IndexedRecordVersion,
  fieldId: string,
  pack: ProposalDomainPack,
  constructId?: string,
): string | null {
  const chip = record.provenanceByFieldKey[fieldId];
  if (!chip) {
    return null;
  }
  const raw = chip.normalized.normalizedValue;
  if (raw == null || raw === "") {
    return null;
  }
  const steps = constructId ? pack.constructs?.[constructId]?.normalize : undefined;
  return normalizeText(raw, steps, pack);
}

export type ContentKeyResult = {
  key: string | null;
  partial: boolean;
  parts: Record<string, string | null>;
  missingRequired: string[];
  conflictingOptional: string[];
};

export function buildContentKey(
  record: IndexedRecordVersion,
  pack: ProposalDomainPack,
): ContentKeyResult {
  const recordDef = pack.recordTypes.find((r) => r.id === record.recordTypeId);
  const identity = recordDef?.identity;
  const missingRequired: string[] = [];
  const conflictingOptional: string[] = [];
  const parts: Record<string, string | null> = {};

  if (!identity) {
    return { key: null, partial: true, parts, missingRequired: ["identity"], conflictingOptional };
  }

  for (const fieldId of identity.keyFields ?? []) {
    const value = normalizedFieldValue(record, fieldId, pack);
    parts[fieldId] = value;
    if (value == null) {
      missingRequired.push(fieldId);
    }
  }

  if (missingRequired.length > 0) {
    return { key: null, partial: true, parts, missingRequired, conflictingOptional };
  }

  const material = (identity.keyFields ?? [])
    .map((fieldId) => `${fieldId}=${parts[fieldId] ?? ""}`)
    .join("|");
  return { key: material, partial: false, parts, missingRequired, conflictingOptional };
}

export function buildConstructJoinKey(
  record: IndexedRecordVersion,
  constructId: string,
  pack: ProposalDomainPack,
): string | null {
  const construct = pack.constructs?.[constructId] as ProposalConstruct | undefined;
  if (!construct) {
    return null;
  }
  const parts: string[] = [];
  for (const fieldSuffix of construct.requiredFields ?? []) {
    const fieldId = `${constructId}.${fieldSuffix}`;
    const value = normalizedFieldValue(record, fieldId, pack, constructId);
    if (value == null) {
      return null;
    }
    parts.push(`${fieldId}=${value}`);
  }
  return parts.join("|");
}

export function valuesEquivalent(
  left: string | null,
  right: string | null,
  constructId: string | undefined,
  pack: ProposalDomainPack,
): "equal" | "different" | "possibly_same" {
  if (left == null || right == null) {
    return "different";
  }
  if (left === right) {
    return "equal";
  }
  const onPartial = constructId ? pack.constructs?.[constructId]?.onPartialMatch : undefined;
  if (onPartial === "possiblySame") {
    if (left.includes(right) || right.includes(left)) {
      return "possibly_same";
    }
  }
  return "different";
}
