import { randomUUID } from "node:crypto";

import type {
  DiscoverQuestion,
  HiveDiscoverProposalV2,
  ProposedClarificationQuestion,
} from "@hiveforyou/shared/discover";
import type { DiscoverValidationIssue } from "@hiveforyou/shared/discover";

export function mapValidatedClarificationQuestions(proposal: HiveDiscoverProposalV2):
  | { ok: true; questions: DiscoverQuestion[] }
  | { ok: false; issues: DiscoverValidationIssue[] } {
  const logicalIds = new Set(proposal.logicalDocuments.map((doc) => doc.id));
  const ambiguityIds = new Set(proposal.ambiguityCandidates.map((item) => item.id));
  const seenQuestionIds = new Set<string>();
  const questions: DiscoverQuestion[] = [];
  const issues: DiscoverValidationIssue[] = [];

  for (const [index, item] of proposal.clarificationQuestions.entries()) {
    const path = `clarificationQuestions[${index}]`;
    const itemIssues = validateProposedQuestion(item, logicalIds, ambiguityIds, seenQuestionIds, path);
    if (itemIssues.length) {
      issues.push(...itemIssues);
      continue;
    }
    seenQuestionIds.add(item.id);
    questions.push({
      id: randomUUID(),
      questionKey: `discovery.clarification:${item.id}`,
      prompt: item.prompt,
      humanReason: item.humanReason,
      answerKind: item.answerKind,
      options: item.options,
      ambiguityKey: `amb:${item.ambiguityCandidateId}`,
      relatedLogicalDocumentIds: [...item.relatedLogicalDocumentIds],
      required: true,
    });
  }

  if (issues.length) {
    return { ok: false, issues };
  }
  return { ok: true, questions };
}

function validateProposedQuestion(
  item: ProposedClarificationQuestion,
  logicalIds: Set<string>,
  ambiguityIds: Set<string>,
  seenQuestionIds: Set<string>,
  path: string,
): DiscoverValidationIssue[] {
  const issues: DiscoverValidationIssue[] = [];
  if (!item.id?.trim()) {
    issues.push({ code: "MALFORMED_PROPOSAL", message: "Clarification question id is required.", path: `${path}.id` });
  } else if (seenQuestionIds.has(item.id)) {
    issues.push({
      code: "MALFORMED_PROPOSAL",
      message: "Duplicate clarification question id.",
      path: `${path}.id`,
    });
  }
  if (!item.prompt?.trim()) {
    issues.push({ code: "MALFORMED_PROPOSAL", message: "Clarification prompt is required.", path: `${path}.prompt` });
  }
  if (!ambiguityIds.has(item.ambiguityCandidateId)) {
    issues.push({
      code: "MALFORMED_PROPOSAL",
      message: "Clarification question must reference a proposed ambiguity candidate.",
      path: `${path}.ambiguityCandidateId`,
    });
  }
  for (const docId of item.relatedLogicalDocumentIds) {
    if (!logicalIds.has(docId)) {
      issues.push({
        code: "MALFORMED_PROPOSAL",
        message: `Unknown logical document id: ${docId}`,
        path: `${path}.relatedLogicalDocumentIds`,
      });
    }
  }
  if (item.answerKind !== "single_choice" && item.answerKind !== "multi_select") {
    issues.push({
      code: "MALFORMED_PROPOSAL",
      message: "Clarification questions must use single_choice or multi_select.",
      path: `${path}.answerKind`,
    });
  }
  if (!item.options?.length) {
    issues.push({
      code: "MALFORMED_PROPOSAL",
      message: "Clarification questions require at least one option.",
      path: `${path}.options`,
    });
  } else {
    const optionIds = new Set<string>();
    for (const option of item.options) {
      if (!option.id?.trim() || !option.label?.trim()) {
        issues.push({
          code: "MALFORMED_PROPOSAL",
          message: "Each option requires id and label.",
          path: `${path}.options`,
        });
      } else if (optionIds.has(option.id)) {
        issues.push({
          code: "MALFORMED_PROPOSAL",
          message: "Duplicate option id in clarification question.",
          path: `${path}.options`,
        });
      } else {
        optionIds.add(option.id);
      }
    }
  }
  return issues;
}
