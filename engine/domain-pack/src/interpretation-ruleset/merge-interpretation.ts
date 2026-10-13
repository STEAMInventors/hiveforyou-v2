import { createHash } from "node:crypto";

import type { ProposalDomainPack, ProposalInsightCheck, ProposalRecordType } from "../pack-driven-reader/types.js";
import type {
  InterpretationDocumentTypePatch,
  InterpretationOverlay,
  InterpretationRecordTypePatch,
} from "./types.js";
import { INTERPRETATION_OVERLAY_SCHEMA_VERSION } from "./types.js";

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

export function hashInterpretationOverlay(overlay: InterpretationOverlay): string {
  const body = {
    schemaVersion: overlay.schemaVersion,
    manifest: overlay.manifest,
    compatibleReaderPackContentSha256: [...overlay.compatibleReaderPackContentSha256]
      .map((h) => h.toLowerCase())
      .sort(),
    relationshipRules: overlay.relationshipRules ?? null,
    recordTypePatches: overlay.recordTypePatches ?? [],
    documentTypePatches: overlay.documentTypePatches ?? [],
    insightCheckReplacements: overlay.insightCheckReplacements ?? [],
    vocabulary: overlay.vocabulary ?? null,
    seriesObservationDateFieldIds: overlay.seriesObservationDateFieldIds ?? null,
    compositionRules: overlay.compositionRules ?? null,
  };
  return createHash("sha256").update(stableJson(body)).digest("hex");
}

export function assertReaderPackCompatibleWithOverlay(
  readerPackContentSha256: string,
  overlay: InterpretationOverlay,
): void {
  if (overlay.schemaVersion !== INTERPRETATION_OVERLAY_SCHEMA_VERSION) {
    throw new Error("INTERPRETATION_OVERLAY_INVALID:schemaVersion");
  }
  const readerHash = readerPackContentSha256.trim().toLowerCase();
  const allowed = overlay.compatibleReaderPackContentSha256.map((h) => h.toLowerCase());
  if (!allowed.includes(readerHash)) {
    throw new Error("INTERPRETATION_READER_PACK_INCOMPATIBLE");
  }
}

function applyRecordPatch(record: ProposalRecordType, patch: InterpretationRecordTypePatch): ProposalRecordType {
  let fields = record.fields;
  if (patch.fieldsReplace) {
    fields = patch.fieldsReplace;
  } else if (patch.fieldsAppend?.length) {
    const existing = new Set(fields.map((f) => f.id));
    fields = [
      ...fields,
      ...patch.fieldsAppend.filter((f) => !existing.has(f.id)),
    ];
  }
  if (patch.fieldDerivationPatches?.length) {
    const derivationByFieldId = new Map(
      patch.fieldDerivationPatches.map((entry) => [entry.fieldId, entry.derivation] as const),
    );
    fields = fields.map((field) => {
      const derivation = derivationByFieldId.get(field.id);
      return derivation ? { ...field, derivation } : field;
    });
  }
  return {
    ...record,
    ...(patch.identity ? { identity: { ...record.identity, ...patch.identity } } : {}),
    ...(patch.composition ? { composition: { ...record.composition, ...patch.composition } } : {}),
    fields,
  };
}

function applyDocumentTypePatch(
  documentType: ProposalDomainPack["documentTypes"][number],
  patch: InterpretationDocumentTypePatch,
): ProposalDomainPack["documentTypes"][number] {
  return {
    ...documentType,
    ...(patch.orderingDate !== undefined ? { orderingDate: patch.orderingDate } : {}),
    ...(patch.orderingDatePaths !== undefined ? { orderingDatePaths: patch.orderingDatePaths } : {}),
  };
}

export function mergeInterpretationOntoReaderPack(
  readerPack: ProposalDomainPack,
  overlay: InterpretationOverlay,
): ProposalDomainPack {
  const patches = new Map((overlay.recordTypePatches ?? []).map((p) => [p.id, p] as const));
  const recordTypes = readerPack.recordTypes.map((record) => {
    const patch = patches.get(record.id);
    return patch ? applyRecordPatch(record, patch) : record;
  });

  const documentPatches = new Map((overlay.documentTypePatches ?? []).map((p) => [p.id, p] as const));
  const documentTypes =
    documentPatches.size === 0 || !readerPack.documentTypes?.length
      ? readerPack.documentTypes
      : readerPack.documentTypes.map((documentType) => {
          const patch = documentPatches.get(documentType.id);
          return patch ? applyDocumentTypePatch(documentType, patch) : documentType;
        });

  let insightChecks = readerPack.insightChecks;
  if (overlay.insightCheckReplacements?.length && insightChecks) {
    const replacements = new Map(overlay.insightCheckReplacements.map((c) => [c.id, c] as const));
    const checks: ProposalInsightCheck[] = insightChecks.checks.map(
      (check) => replacements.get(check.id) ?? check,
    );
    for (const replacement of overlay.insightCheckReplacements) {
      if (!checks.some((c) => c.id === replacement.id)) {
        checks.push(replacement);
      }
    }
    insightChecks = { ...insightChecks, checks };
  }

  const vocabulary =
    overlay.vocabulary && readerPack.vocabulary
      ? {
          ...readerPack.vocabulary,
          ...overlay.vocabulary,
          fieldSynonyms: [
            ...(readerPack.vocabulary.fieldSynonyms ?? []),
            ...(overlay.vocabulary.fieldSynonyms ?? []),
          ],
        }
      : (overlay.vocabulary ?? readerPack.vocabulary);

  const compositionRules = [...(readerPack.compositionRules ?? [])];
  for (const rule of overlay.compositionRules ?? []) {
    if (!compositionRules.some((existing) => existing.id === rule.id)) {
      compositionRules.push(rule);
    }
  }

  return {
    ...readerPack,
    documentTypes,
    relationshipRules: overlay.relationshipRules ?? readerPack.relationshipRules,
    seriesObservationDateFieldIds:
      overlay.seriesObservationDateFieldIds ?? readerPack.seriesObservationDateFieldIds,
    compositionRules: compositionRules.length > 0 ? compositionRules : readerPack.compositionRules,
    recordTypes,
    insightChecks,
    vocabulary,
  };
}

export function parseInterpretationOverlay(raw: unknown): InterpretationOverlay {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("INTERPRETATION_OVERLAY_INVALID:shape");
  }
  const record = raw as InterpretationOverlay;
  if (record.schemaVersion !== INTERPRETATION_OVERLAY_SCHEMA_VERSION) {
    throw new Error("INTERPRETATION_OVERLAY_INVALID:schemaVersion");
  }
  if (!record.manifest?.id || !record.manifest?.version) {
    throw new Error("INTERPRETATION_OVERLAY_INVALID:manifest");
  }
  if (
    !Array.isArray(record.compatibleReaderPackContentSha256) ||
    record.compatibleReaderPackContentSha256.length === 0
  ) {
    throw new Error("INTERPRETATION_OVERLAY_INVALID:compatibleReaderPackContentSha256");
  }
  return record;
}
