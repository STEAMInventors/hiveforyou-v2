import type { InitialIepFactCatalog } from "./catalog-types.js";
import type { L001DocumentBundle } from "./corpus.js";
import { ONTOLOGY_EXPERIMENT_BUDGET } from "./prompt.js";
import type { ExtractionMode } from "./run-mode.js";

export type PlannedCall = {
  callId: string;
  mode: ExtractionMode;
  scope: "document" | "case" | "relationship";
  filename?: string;
  phase: "atomic" | "relationship";
};

export function buildDryRunPlan(mode: ExtractionMode, bundles: L001DocumentBundle[]): PlannedCall[] {
  if (mode === "A") {
    return bundles.map((b) => ({
      callId: `A-doc-${b.filename}`,
      mode: "A",
      scope: "document" as const,
      filename: b.filename,
      phase: "atomic" as const,
    }));
  }
  if (mode === "B") {
    return [{ callId: "B-case-wide", mode: "B", scope: "case", phase: "atomic" }];
  }
  return [
    ...bundles.map((b) => ({
      callId: `C-doc-${b.filename}`,
      mode: "C" as const,
      scope: "document" as const,
      filename: b.filename,
      phase: "atomic" as const,
    })),
    { callId: "C-case-relationship", mode: "C", scope: "relationship", phase: "relationship" },
  ];
}

export function estimateDryRun(input: {
  catalog: InitialIepFactCatalog;
  bundles: L001DocumentBundle[];
  modes: ExtractionMode[];
  provider: string;
  modelName: string;
}) {
  let documentChars = 0;
  for (const bundle of input.bundles) {
    for (const page of bundle.documentPages.pages) {
      for (const word of page.words) {
        documentChars += word.text.length + 1;
      }
    }
  }
  const stablePrefixChars = 12_000 + input.catalog.entries.length * 120;
  const perDocChars = Math.ceil(documentChars / input.bundles.length);

  const plans = input.modes.flatMap((mode) => buildDryRunPlan(mode, input.bundles));
  const estimatedInputTokens = plans.reduce((sum, plan) => {
    const docChars = plan.scope === "document" ? perDocChars : documentChars;
    return sum + Math.ceil((stablePrefixChars + docChars) / 4);
  }, 0);
  const estimatedOutputTokens = plans.length * 4_000;

  return {
    experiment: "t3-9-ontology",
    gitHead: "603a192",
    provider: input.provider,
    modelName: input.modelName,
    budget: ONTOLOGY_EXPERIMENT_BUDGET,
    catalogEntries: input.catalog.entries.length,
    l001Documents: input.bundles.length,
    plannedCalls: plans,
    callCount: plans.length,
    estimatedInputTokens,
    estimatedOutputTokens,
    note: "Dry-run only — no model provider invoked.",
  };
}
