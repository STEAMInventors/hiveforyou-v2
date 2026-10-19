import { existsSync } from "node:fs";
import { join } from "node:path";

import { SUPPORTED_DECLARATIVE_PRIMITIVES } from "../declarative/types.js";
import type { MappingPackCanonical, MappingPackManifest } from "./types.js";
import { MAPPING_PACK_CONTRACT_VERSION } from "./types.js";

export type MappingPackValidationResult = {
  valid: boolean;
  errors: string[];
};

export function validateMappingPackFilesExist(packRoot: string, manifest: MappingPackManifest): string[] {
  const errors: string[] = [];
  for (const section of manifest.schemaSections) {
    const path = join(packRoot, `${section}.json`);
    if (!existsSync(path)) {
      errors.push(`missing schema section file: ${section}.json`);
    }
  }
  if (!existsSync(join(packRoot, "manifest.json"))) {
    errors.push("missing manifest.json");
  }
  return errors;
}

export function validateMappingPackStructure(canonical: MappingPackCanonical): MappingPackValidationResult {
  const errors: string[] = [];
  const err = (message: string) => errors.push(message);

  const { manifest } = canonical;
  if (!manifest.id?.trim()) err("manifest.id required");
  if (!manifest.packVersion?.trim()) err("manifest.packVersion required");
  if (manifest.contractVersion !== MAPPING_PACK_CONTRACT_VERSION) {
    err(`unsupported contractVersion ${manifest.contractVersion}`);
  }

  const conceptIds = new Set<string>();
  for (const concept of canonical.concepts.concepts ?? []) {
    if (!concept.id?.includes(".")) {
      err(`concept id must be record.field: ${concept.id}`);
    }
    if (conceptIds.has(concept.id)) err(`duplicate concept ${concept.id}`);
    conceptIds.add(concept.id);
  }

  for (const doc of canonical.documents.documentProfiles ?? []) {
    for (const item of doc.checklist) {
      if (!conceptIds.has(item.conceptId)) {
        err(`${doc.id}: unknown checklist conceptId ${item.conceptId}`);
      }
    }
  }

  for (const rel of canonical.relationships.relationships ?? []) {
    if (
      !SUPPORTED_DECLARATIVE_PRIMITIVES.includes(
        rel.primitive as (typeof SUPPORTED_DECLARATIVE_PRIMITIVES)[number],
      )
    ) {
      err(`relationship ${rel.id}: unsupported primitive ${rel.primitive}`);
    }
    for (const conceptId of [...rel.from, ...rel.to]) {
      if (!conceptIds.has(conceptId)) {
        err(`relationship ${rel.id}: unknown concept ${conceptId}`);
      }
    }
  }

  for (const persona of canonical.personas.personas ?? []) {
    if (!persona.id?.trim()) err("persona id required");
  }

  return { valid: errors.length === 0, errors };
}
