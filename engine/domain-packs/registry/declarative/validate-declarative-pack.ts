import { existsSync } from "node:fs";
import { join } from "node:path";

import { SUPPORTED_DECLARATIVE_PRIMITIVES, DECLARATIVE_PACK_CONTRACT_VERSION } from "./types.js";
import type { DeclarativePackRaw } from "./types.js";

export type DeclarativePackValidationResult = {
  valid: boolean;
  errors: string[];
};

export function validateDeclarativePackFilesExist(packRoot: string, manifest: DeclarativePackRaw["manifest"]): string[] {
  const errors: string[] = [];
  for (const section of manifest.schemaSections) {
    const path = join(packRoot, `${section}.json`);
    if (!existsSync(path)) {
      errors.push(`missing schema section file: ${section}.json`);
    }
  }
  for (const section of manifest.additionalDefinitions ?? []) {
    const path = join(packRoot, `${section}.json`);
    if (!existsSync(path)) {
      errors.push(`missing additional definition file: ${section}.json`);
    }
  }
  if (!existsSync(join(packRoot, "manifest.json"))) {
    errors.push("missing manifest.json");
  }
  return errors;
}

export function validateDeclarativePackStructure(raw: DeclarativePackRaw): DeclarativePackValidationResult {
  const errors: string[] = [];
  const err = (message: string) => errors.push(message);

  const { manifest } = raw;
  if (!manifest.id?.trim()) err("manifest.id required");
  if (!manifest.packVersion?.trim()) err("manifest.packVersion required");
  if (manifest.contractVersion !== DECLARATIVE_PACK_CONTRACT_VERSION) {
    err(`unsupported contractVersion ${manifest.contractVersion}`);
  }

  const facts = raw.factTypes.factTypes ?? [];
  const factIds = new Set<string>();
  for (const fact of facts) {
    if (!fact.id?.includes(".")) {
      err(`fact type id must be record.field: ${fact.id}`);
    }
    if (factIds.has(fact.id)) err(`duplicate fact type ${fact.id}`);
    factIds.add(fact.id);
  }

  const docs = raw.documentTypes.documentTypes ?? [];
  const docIds = new Set<string>();
  for (const doc of docs) {
    if (docIds.has(doc.id)) err(`duplicate document type ${doc.id}`);
    docIds.add(doc.id);
    const checklistIds = doc.checklist.map((item) => item.factTypeId);
    if (new Set(checklistIds).size !== checklistIds.length) {
      err(`${doc.id}: duplicate checklist factTypeId`);
    }
    for (const factTypeId of checklistIds) {
      if (!factIds.has(factTypeId)) {
        err(`${doc.id}: unknown checklist factTypeId ${factTypeId}`);
      }
    }
  }

  for (const rel of raw.relationships.relationships ?? []) {
    if (!SUPPORTED_DECLARATIVE_PRIMITIVES.includes(rel.primitive as (typeof SUPPORTED_DECLARATIVE_PRIMITIVES)[number])) {
      err(`relationship ${rel.id}: unsupported primitive ${rel.primitive}`);
    }
    for (const factId of [...rel.from, ...rel.to]) {
      if (!factIds.has(factId)) {
        err(`relationship ${rel.id}: unknown fact ${factId}`);
      }
    }
  }

  for (const check of raw.insightChecks.insightChecks ?? []) {
    for (const factId of check.inputs ?? []) {
      if (!factIds.has(factId)) {
        err(`insight check ${check.id}: unknown input fact ${factId}`);
      }
    }
    if (check.unknownOutcome !== "no_public_finding") {
      err(`insight check ${check.id}: unknownOutcome must be no_public_finding`);
    }
    if (/\{|\}/.test(check.questionTemplate)) {
      err(`insight check ${check.id}: questionTemplate must not contain unresolved placeholders`);
    }
  }

  if ((raw.requirements.requirements ?? []).length > 0) {
    err("requirements must be empty for v0.2 declarative contract in this qualification path");
  }

  return { valid: errors.length === 0, errors };
}
