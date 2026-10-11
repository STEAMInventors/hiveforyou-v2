import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { GoldenCase } from "../../../engine/eval/src/index.js";

import type { InitialIepFactCatalog } from "./catalog-types.js";

const experimentRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export function catalogPath(): string {
  return join(experimentRoot, "catalog/initial-iep-fact-catalog.json");
}

export function loadInitialIepFactCatalog(): InitialIepFactCatalog {
  const raw = JSON.parse(readFileSync(catalogPath(), "utf8")) as InitialIepFactCatalog;
  if (raw.goldenTargetCount !== 29 || raw.entries.length !== 29) {
    throw new Error(
      `Initial IEP catalog must define exactly 29 golden types (got ${raw.entries.length}).`,
    );
  }
  return raw;
}

export function initialIepGoldenFacts(golden: GoldenCase) {
  return golden.facts.filter((f) => f.documentId === "08_initial_iep.pdf");
}

export function catalogEntriesForPhase(
  catalog: InitialIepFactCatalog,
  phase: "atomic" | "relationship" | "all",
) {
  if (phase === "all") {
    return catalog.entries;
  }
  return catalog.entries.filter((e) => e.extractionPhase === phase);
}
