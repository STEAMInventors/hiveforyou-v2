import {
  readerWireFactToCandidateFact,
  type ReaderExperimentCandidateFact,
} from "../../../engine/eval/src/reader-experiment/fact-match.js";

import type { InitialIepFactCatalog } from "./catalog-types.js";
import {
  parseOntologyExtractionResponse,
  type CatalogValidationContext,
  type OntologyProposal,
} from "./extraction-contract.js";
import { adaptOntologyProposalToReaderWire } from "./ontology-to-reader.js";

export type { OntologyProposal } from "./extraction-contract.js";

export type ParseExtractionResult = {
  proposals: OntologyProposal[];
  candidates: ReaderExperimentCandidateFact[];
  dropped: number;
};

function catalogLookup(catalog: InitialIepFactCatalog): Map<string, CatalogValidationContext> {
  return new Map(
    catalog.entries.map((entry) => [
      entry.typeId,
      {
        atomicField: entry.atomicField,
        valueKind: entry.valueKind,
        acceptableModalities: entry.acceptableModalities,
        minQuotes: entry.evidenceRequirements.minQuotes,
      },
    ]),
  );
}

function rawProposals(parsed: unknown): unknown[] {
  if (!parsed || typeof parsed !== "object") {
    return [];
  }
  const proposals = (parsed as { proposals?: unknown }).proposals;
  return Array.isArray(proposals) ? proposals : [];
}

export function parseExtractionResponse(
  outputText: string | null,
  catalog: InitialIepFactCatalog,
): ParseExtractionResult {
  if (!outputText?.trim()) {
    return { proposals: [], candidates: [], dropped: 0 };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText) as unknown;
  } catch {
    return { proposals: [], candidates: [], dropped: 0 };
  }

  const catalogByTypeId = catalogLookup(catalog);
  const { proposals, dropped } = parseOntologyExtractionResponse(parsed, catalogByTypeId);

  const candidates: ReaderExperimentCandidateFact[] = [];
  for (const item of rawProposals(parsed)) {
    const adapted = adaptOntologyProposalToReaderWire(item, catalogByTypeId);
    if (!adapted.ok) {
      continue;
    }
    const candidate = readerWireFactToCandidateFact(adapted.wire);
    if (candidate) {
      candidates.push(candidate);
    }
  }

  return { proposals, candidates, dropped };
}
