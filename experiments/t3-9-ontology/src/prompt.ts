import { iepDomainPack } from "@hiveforyou/domain-pack-iep";

import type { FactCatalogEntry, InitialIepFactCatalog } from "./catalog-types.js";
import type { L001DocumentBundle } from "./corpus.js";

/** Shared budget policy across modes A/B/C (matches ontology experiment contract). */
export const ONTOLOGY_EXPERIMENT_BUDGET = {
  temperature: 0,
  maxOutputTokens: 16_000,
  concurrency: 3,
} as const;

const PACK_READER = iepDomainPack.study.agents.reader;

function formatCatalogEntries(entries: FactCatalogEntry[]): string {
  return entries
    .map((e) => {
      const optional = e.required ? "" : " (optional — omit when not stated)";
      const unit = e.unit ? ` unit=${e.unit}` : "";
      return `- ${e.typeId}: field=${e.atomicField}; valueKind=${e.valueKind}; modalities=${e.acceptableModalities.join("|")}; cardinality=${e.cardinality.min}..${e.cardinality.max}${unit}${optional}`;
    })
    .join("\n");
}

function pagesPayload(bundle: L001DocumentBundle): unknown {
  return {
    sourceDocumentId: bundle.sourceDocumentId,
    filename: bundle.filename,
    documentType: bundle.documentType,
    pages: bundle.documentPages.pages.map((p) => ({
      pageNumber: p.pageNumber,
      words: p.words.map((w) => w.text),
    })),
  };
}

export function buildStableSystemPrompt(catalog: InitialIepFactCatalog): string {
  return [
    "You are an IEP document reader in a controlled ontology extraction experiment.",
    "Propose candidate facts ONLY for catalog types listed below. Do not invent catalog types.",
    "Use modality to reflect observed vs planned vs decided language in the source.",
    "Each proposal MUST include at least one evidence quote that appears as consecutive words on the cited page.",
    "Do not copy golden IDs, entity IDs, or expected values from examples — extract from the supplied pages only.",
    "Treat service frequency, session length, and total minutes per week as separate fields when present; do not require session length or sessions/week when absent.",
    "Optional catalog rows may be omitted entirely when the document does not state them.",
    "",
    "Domain pack reader guidance (methodology only):",
    PACK_READER,
    "",
    `Target IEP document type: ${catalog.documentType}`,
    "Initial IEP fact catalog (types only — no expected values):",
    formatCatalogEntries(catalog.entries),
  ].join("\n");
}

export function buildAtomicExtractionUserPrompt(input: {
  catalog: InitialIepFactCatalog;
  scope: "document" | "case";
  bundles: L001DocumentBundle[];
  phase: "atomic" | "relationship";
  acceptedAtomicsJson?: string;
}): string {
  const entries = input.catalog.entries.filter((e) => e.extractionPhase === input.phase);
  const header =
    input.scope === "document"
      ? "Extract ATOMIC catalog facts for this single document only."
      : "Extract ATOMIC catalog facts across the full case document set.";

  const blocks: string[] = [
    header,
    `Phase: ${input.phase}`,
    "Return JSON: { \"proposals\": [ { \"id\", \"catalogTypeId\", \"construct\": { \"measure\", \"task?\", \"administration?\" }, \"value\", \"modality\", \"evidence\": [ { \"sourceDocumentId\", \"page\", \"quote\" } ] } ] }",
    "Include catalogTypeId matching a catalog typeId when possible.",
    "Catalog slice:",
    formatCatalogEntries(entries),
    "",
    "Document pages (untrusted):",
    JSON.stringify(input.bundles.map(pagesPayload)),
  ];

  if (input.acceptedAtomicsJson) {
    blocks.push("", "Validated atomic proposals from prior step (trusted for linkage only):", input.acceptedAtomicsJson);
  }

  return blocks.join("\n");
}

export function buildCaseWideCatalogUserPrompt(input: {
  catalog: InitialIepFactCatalog;
  bundles: L001DocumentBundle[];
}): string {
  return [
    "Extract ALL catalog facts (atomic and relationship) across the full L001 case.",
    "Return JSON: { \"proposals\": [ { \"id\", \"catalogTypeId\", \"construct\", \"value\", \"modality\", \"evidence\": [ { \"sourceDocumentId\", \"page\", \"quote\" } ] } ] }",
    "Catalog:",
    formatCatalogEntries(input.catalog.entries),
    "",
    "Document pages (untrusted):",
    JSON.stringify(input.bundles.map(pagesPayload)),
  ].join("\n");
}

export function buildRelationshipExtractionUserPrompt(input: {
  catalog: InitialIepFactCatalog;
  bundles: L001DocumentBundle[];
  acceptedAtomicsJson: string;
}): string {
  const entries = input.catalog.entries.filter((e) => e.extractionPhase === "relationship");
  return [
    "Extract RELATIONSHIP catalog facts for the full case using validated atomics as context.",
    "Do not re-propose atomics unless correcting evidence for a relationship row.",
    "Return JSON: { \"proposals\": [...] } with the same proposal shape as atomic extraction.",
    "Relationship catalog slice:",
    formatCatalogEntries(entries),
    "",
    "Validated atomic proposals:",
    input.acceptedAtomicsJson,
    "",
    "Document pages (untrusted):",
    JSON.stringify(input.bundles.map(pagesPayload)),
  ].join("\n");
}
