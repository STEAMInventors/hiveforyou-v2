import type { EvidenceReferenceV4 } from "@hiveforyou/shared/case-intelligence/4";

import type { ReaderExperimentCandidateFact } from "../../../engine/eval/src/reader-experiment/fact-match.js";

import type { OntologyProposal } from "./extraction-contract.js";

export function ontologyProposalToReaderCandidate(
  proposal: OntologyProposal,
): ReaderExperimentCandidateFact {
  const evidenceRefs: EvidenceReferenceV4[] = proposal.evidence.map((ev, index) => ({
    id: `${proposal.id}-ev-${index + 1}`,
    sourceDocumentId: ev.sourceDocumentId,
    page: ev.page,
    quote: ev.quote,
    sourceType: "document",
  }));

  return {
    id: proposal.id,
    construct: {
      measure: proposal.construct.measure,
      task: proposal.construct.task ?? null,
      administration: proposal.construct.administration ?? null,
    },
    value: proposal.value,
    modality: proposal.modality,
    evidenceRefs,
  };
}