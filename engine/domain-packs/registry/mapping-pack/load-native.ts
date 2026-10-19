import { readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  MappingPackCanonical,
  MappingPackConceptSection,
  MappingPackDocumentsSection,
  MappingPackManifest,
  MappingPackPersonasSection,
  MappingPackRelationshipsSection,
} from "./types.js";
import { MAPPING_PACK_CONTRACT_VERSION } from "./types.js";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function loadNativeMappingPackFromRoot(packRoot: string): MappingPackCanonical {
  const manifest = readJson<MappingPackManifest>(join(packRoot, "manifest.json"));
  if (manifest.contractVersion !== MAPPING_PACK_CONTRACT_VERSION) {
    throw new Error(`unsupported mapping pack contractVersion ${manifest.contractVersion}`);
  }

  const concepts = readJson<MappingPackConceptSection>(join(packRoot, "concepts.json"));
  const documents = readJson<MappingPackDocumentsSection>(join(packRoot, "documents.json"));
  const relationships = readJson<MappingPackRelationshipsSection>(join(packRoot, "relationships.json"));
  const personas = readJson<MappingPackPersonasSection>(join(packRoot, "personas.json"));

  return { manifest, concepts, documents, relationships, personas };
}
