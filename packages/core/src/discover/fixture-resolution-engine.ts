import type {
  CustomerDiscoveryAnswer,
  DiscoverQuestion,
  HiveDiscoverProposalV2,
  HiveDiscoverResolutionProposalV1,
} from "@hiveforyou/shared/discover";
import { HIVE_DISCOVER_RESOLUTION_SCHEMA } from "@hiveforyou/shared/discover";

import type { DiscoverResolutionContext, DiscoverResolutionEngine } from "./engine";

function findAnswerForQuestion(
  question: DiscoverQuestion,
  answers: CustomerDiscoveryAnswer[],
): CustomerDiscoveryAnswer | undefined {
  return answers.find((answer) => answer.questionId === question.id);
}

export class FixtureDiscoverResolutionEngine implements DiscoverResolutionEngine {
  async resolveDiscovery(
    context: DiscoverResolutionContext,
  ): Promise<HiveDiscoverResolutionProposalV1> {
    const proposal = context.priorProposal;
    let relationships = [...proposal.relationships];
    const resolvedAmbiguityIds: string[] = [];
    const unresolvedAmbiguityIds: string[] = [];

    for (const question of context.discoverQuestions) {
      const answer = findAnswerForQuestion(question, context.customerAnswers);
      const choiceId =
        answer && typeof answer.answer.choiceId === "string"
          ? answer.answer.choiceId
          : undefined;

      if (choiceId === "same_sequence" && question.relatedLogicalDocumentIds.length >= 2) {
        const [fromId, toId] = question.relatedLogicalDocumentIds;
        if (fromId && toId) {
          relationships.push({
            id: `rel-resolved-${fromId}-${toId}`,
            fromLogicalDocumentId: fromId,
            toLogicalDocumentId: toId,
            kind: "same_sequence",
            label: "Customer confirmed same sequence",
          });
        }
        resolvedAmbiguityIds.push(question.ambiguityKey.replace(/^amb:/, ""));
      } else if (choiceId === "unsure") {
        unresolvedAmbiguityIds.push(question.ambiguityKey.replace(/^amb:/, ""));
      } else if (choiceId) {
        resolvedAmbiguityIds.push(question.ambiguityKey.replace(/^amb:/, ""));
      }
    }

    return {
      schemaVersion: HIVE_DISCOVER_RESOLUTION_SCHEMA,
      domainResolution: proposal.domainResolution,
      logicalDocuments: proposal.logicalDocuments.map((doc) => ({
        ...doc,
        recognitionStatus:
          questionResolved(doc.id, context) ? "recognized" : doc.recognitionStatus,
      })),
      relationships,
      resolvedAmbiguityIds,
      unresolvedAmbiguityIds,
    };
  }
}

function questionResolved(
  logicalDocumentId: string,
  context: DiscoverResolutionContext,
): boolean {
  return context.discoverQuestions.some((question) => {
    if (!question.relatedLogicalDocumentIds.includes(logicalDocumentId)) {
      return false;
    }
    const answer = context.customerAnswers.find((item) => item.questionId === question.id);
    return answer && answer.answer.choiceId !== "unsure";
  });
}

export function resolutionProposalFromProposalForOpenAIStub(
  proposal: HiveDiscoverProposalV2,
): HiveDiscoverResolutionProposalV1 {
  return {
    schemaVersion: HIVE_DISCOVER_RESOLUTION_SCHEMA,
    domainResolution: proposal.domainResolution,
    logicalDocuments: proposal.logicalDocuments,
    relationships: proposal.relationships,
    resolvedAmbiguityIds: proposal.ambiguityCandidates.map((item) => item.id),
    unresolvedAmbiguityIds: [],
  };
}
