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
    for (const f of r.fields) {
      if (f.source.includes("classified") && !f.enum?.length) {
        err(`${r.id}.${f.id}: classified without enum`);
      }
      if (f.source.includes("derived")) {
        if (!f.derivation) err(`${r.id}.${f.id}: derived without derivation`);
        else {
          for (const o of f.derivation.operands) {
            if (!ids.has(o) && !hasPath(o)) err(`${r.id}.${f.id}: derivation operand '${o}' not found`);
          }
        }
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
