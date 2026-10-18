import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { DeclarativePackManifest, DeclarativePackRaw } from "./types.js";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function loadDeclarativePackFromRoot(packRoot: string): DeclarativePackRaw {
  const manifest = readJson<DeclarativePackManifest>(join(packRoot, "manifest.json"));
  const readSection = <T>(name: string): T => readJson(join(packRoot, `${name}.json`));

  const raw: DeclarativePackRaw = {
    manifest,
    audience: readSection("audience"),
    documentTypes: readSection("document-types"),
    factTypes: readSection("fact-types"),
    relationships: readSection("relationships"),
    requirements: readSection("requirements"),
    insightChecks: readSection("insight-checks"),
    readingNotes: readSection("reading-notes"),
    vocabulary: readSection("vocabulary"),
    plainExplainers: readSection("plain-explainers"),
    referenceTables: readSection("reference-tables"),
  };
  return raw;
}
