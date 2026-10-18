import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { DeclarativePackManifest } from "./types.js";

function sha256Hex(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/** Deterministic digest over manifest-listed JSON sections (sorted paths). */
export function computeDeclarativePackContentDigest(input: {
  packRoot: string;
  manifest: DeclarativePackManifest;
}): string {
  const parts: string[] = [];
  const sectionFiles = [
    ...input.manifest.schemaSections.map((section) => `${section}.json`),
    ...(input.manifest.additionalDefinitions ?? []).map((section) => `${section}.json`),
  ].sort((a, b) => a.localeCompare(b));

  for (const fileName of sectionFiles) {
    const path = join(input.packRoot, fileName);
    const raw = readFileSync(path, "utf8");
    parts.push(`${fileName}\n${sha256Hex(raw)}`);
  }
  parts.push(`manifest.json\n${sha256Hex(readFileSync(join(input.packRoot, "manifest.json"), "utf8"))}`);
  return sha256Hex(parts.join("\n"));
}
