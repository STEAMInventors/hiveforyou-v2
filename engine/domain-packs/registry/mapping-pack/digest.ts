import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { MappingPackManifest, MappingPackSection } from "./types.js";

function sha256Hex(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/** Deterministic digest over manifest-listed section JSON files (sorted paths). */
export function computeMappingPackContentDigest(input: {
  packRoot: string;
  manifest: MappingPackManifest;
}): string {
  const sectionFiles = [...input.manifest.schemaSections]
    .map((section) => `${section}.json`)
    .sort((a, b) => a.localeCompare(b));

  const parts: string[] = [];
  for (const fileName of sectionFiles) {
    const path = join(input.packRoot, fileName);
    const raw = readFileSync(path, "utf8");
    parts.push(`${fileName}\n${sha256Hex(raw)}`);
  }
  parts.push(`manifest.json\n${sha256Hex(readFileSync(join(input.packRoot, "manifest.json"), "utf8"))}`);
  return sha256Hex(parts.join("\n"));
}

export function stableCanonicalDigest(canonical: unknown): string {
  return sha256Hex(stableStringify(canonical));
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = (v as Record<string, unknown>)[key];
          return acc;
        }, {});
    }
    return v;
  });
}

export function assertMappingPackSection(section: string): section is MappingPackSection {
  return section === "concepts" || section === "documents" || section === "relationships" || section === "personas";
}
