/**
 * Runtime structural validation aligned with brain/domain-packs/iep/validate-pack.ts
 * (generic — no domain-specific golden concept maps).
 */
import { collectFieldSynonymValidationErrors } from "./field-synonyms.js";
import type { ProposalDomainPack, ProposalRecordType } from "./types.js";

export type ValidateProposalPackResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

const FORBIDDEN_KEY = /^(plan|document|document_id|plan_id|case)$/;

function fieldIds(record: ProposalRecordType): Set<string> {
  return new Set(record.fields.map((f) => f.id));
}

export function validateProposalDomainPack(pack: ProposalDomainPack): ValidateProposalPackResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (m: string) => errors.push(m);

  if (!pack.schemaVersion) err("missing schemaVersion");
  if (!pack.manifest?.id) err("missing manifest.id");
  if (!pack.manifest?.version) err("missing manifest.version");
  if (!Array.isArray(pack.documentTypes) || pack.documentTypes.length === 0) {
    err("documentTypes must be a non-empty array");
  }
  if (!Array.isArray(pack.recordTypes) || pack.recordTypes.length === 0) {
    err("recordTypes must be a non-empty array");
  }
  if (!pack.readingNotes?.global) err("readingNotes.global required");

  const records = new Map<string, ProposalRecordType>();
  for (const r of pack.recordTypes ?? []) {
    if (records.has(r.id)) err(`duplicate record type ${r.id}`);
    records.set(r.id, r);
  }
  const docTypes = new Map<string, (typeof pack.documentTypes)[0]>();
  for (const d of pack.documentTypes ?? []) {
    if (docTypes.has(d.id)) err(`duplicate document type ${d.id}`);
    docTypes.set(d.id, d);
  }

  function hasPath(path: string): boolean {
    const [rec, ...rest] = path.split(".");
    if (!rec) {
      return false;
    }
    const r = records.get(rec);
    if (!r) return false;
    const ids = fieldIds(r);
    for (let n = rest.length; n > 0; n--) {
      if (ids.has(rest.slice(0, n).join("."))) return true;
    }
    return false;
  }

  const hasField = (rec: string, field: string) => {
    const r = records.get(rec);
    return !!r && fieldIds(r).has(field);
  };

  for (const r of pack.recordTypes ?? []) {
    const ids = fieldIds(r);
    if (ids.size !== r.fields.length) err(`${r.id}: duplicate field ids`);
    const id = r.identity;
    if (!id?.versionAxis) err(`${r.id}: no versionAxis`);
    if (!id) {
      continue;
    }
    for (const k of [...(id.keyFields ?? []), ...(id.keyFieldsIfPresent ?? []), ...(id.disambiguators ?? [])]) {
      if (!ids.has(k)) err(`${r.id}: key or disambiguator '${k}' is not a field`);
      if (FORBIDDEN_KEY.test(k)) err(`${r.id}: key '${k}' is a version axis, not content`);
    }
    if ((id.keyFields ?? []).length === 0 && r.repeatable && id.scope !== "document") {
      warnings.push(`${r.id}: repeatable with empty key`);
    }
    if (
      id.crossDocumentMerge &&
      id.crossDocumentMerge !== "version" &&
      id.crossDocumentMerge !== "independent_assertions"
    ) {
      err(`${r.id}: crossDocumentMerge must be version or independent_assertions`);
    }
    for (const f of r.fields) {
      if (f.valueKind === "classification") {
        if (!f.enum?.length) {
          err(`${r.id}.${f.id}: classification without enum`);
        } else {
          const states = new Set(f.enum.map((v) => v.toLowerCase()));
          for (const required of ["yes", "no", "unclear"]) {
            if (!states.has(required)) {
              err(`${r.id}.${f.id}: classification enum must include yes, no, unclear`);
            }
          }
        }
        if (!f.source.includes("classified")) {
          err(`${r.id}.${f.id}: classification fields must use classified source`);
        }
      }
      if (f.source.includes("classified") && !f.enum?.length) {
        err(`${r.id}.${f.id}: classified without enum`);
      }
      if (f.source.includes("derived")) {
        if (!f.derivation) err(`${r.id}.${f.id}: derived without derivation`);
        else {
          for (const o of f.derivation.operands) {
            if (!ids.has(o) && !hasPath(o)) err(`${r.id}.${f.id}: derivation operand '${o}' not found`);
          }
          for (const alternate of f.derivation.alternates ?? []) {
            if (!alternate.primitive || !Array.isArray(alternate.operands)) {
              err(`${r.id}.${f.id}: derivation alternate is incomplete`);
              continue;
            }
            for (const o of alternate.operands) {
              if (!ids.has(o) && !hasPath(o)) {
                err(`${r.id}.${f.id}: derivation alternate operand '${o}' not found`);
              }
            }
          }
        }
      }
      if (f.comparison && !["none", "value", "event"].includes(f.comparison)) {
        err(`${r.id}.${f.id}: comparison must be none, value, or event`);
      }
    }
    for (const c of r.usesConstructs ?? []) {
      const con = pack.constructs?.[c];
      if (!con) {
        err(`${r.id}: unknown construct ${c}`);
        continue;
      }
      for (const f of [...(con.requiredFields ?? []), ...(con.comparedIfBothPresent ?? [])]) {
        if (!ids.has(`${c}.${f}`)) err(`${r.id}: construct ${c} needs field ${c}.${f}`);
      }
    }
  }

  for (const d of pack.documentTypes ?? []) {
    for (const c of d.checklist) {
      if (!records.has(c)) err(`${d.id}: checklist record ${c} unknown`);
    }
  }

  for (const rid of records.keys()) {
    if (!pack.documentTypes.some((d) => d.checklist.includes(rid))) {
      err(`${rid}: in no document checklist`);
    }
  }

  for (const k of Object.keys(pack.readingNotes?.byDocumentType ?? {})) {
    if (!docTypes.has(k)) err(`reading note for unknown document type ${k}`);
  }

  const noteChars =
    JSON.stringify(pack.readingNotes.global).length +
    JSON.stringify(pack.readingNotes.byDocumentType ?? {}).length;
  if (pack.readingNotes.sizeLimitChars && noteChars > pack.readingNotes.sizeLimitChars) {
    err(`reading notes ${noteChars} chars exceed ${pack.readingNotes.sizeLimitChars}`);
  }

  for (const event of pack.caseTimeline?.events ?? []) {
    if (!event.id?.trim()) {
      err("caseTimeline.events: missing id");
    }
    if (!event.label?.trim()) {
      err(`caseTimeline.${event.id}: missing label`);
    }
    if (event.documentTypeId && !docTypes.has(event.documentTypeId)) {
      err(`caseTimeline.${event.id}: unknown documentTypeId ${event.documentTypeId}`);
    }
    if (event.dateFieldPath && !hasPath(event.dateFieldPath)) {
      err(`caseTimeline.${event.id}: dateFieldPath '${event.dateFieldPath}' not found`);
    }
    for (const path of event.eventEvidenceFieldPaths ?? []) {
      if (!hasPath(path)) {
        err(`caseTimeline.${event.id}: eventEvidenceFieldPath '${path}' not found`);
      }
    }
    if (event.recordTypeId && !records.has(event.recordTypeId)) {
      err(`caseTimeline.${event.id}: unknown recordTypeId ${event.recordTypeId}`);
    }
  }

  for (const message of collectFieldSynonymValidationErrors(pack.vocabulary?.fieldSynonyms)) {
    err(message);
  }
  for (const entry of pack.vocabulary?.fieldSynonyms ?? []) {
    const [rec, ...rest] = entry.field.split(".");
    if (!rec) {
      err(`vocabulary.fieldSynonyms: field ${entry.field} is invalid`);
      continue;
    }
    const fieldPath = rest.join(".");
    const constructIds = new Set(Object.keys(pack.constructs ?? {}));
    if (!hasField(rec, fieldPath) && !constructIds.has(rec)) {
      err(`vocabulary.fieldSynonyms: field ${entry.field} not found`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
