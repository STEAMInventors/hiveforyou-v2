import { describe, expect, it } from "vitest";

import { INTAKE_STUDY_ANSWER_SNAPSHOT, INTAKE_STUDY_QUESTION_SET } from "@hiveforyou/shared/canonical-study";
import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";
import { getRecognitionVocabularyByDomainId, serializeRecognitionVocabularyForPrompt } from "@hiveforyou/domain-packs";

import { loadCanonicalStudyPrompt } from "../prompts/load-canonical-study-prompt";
import { composeCanonicalStudyPromptInputs } from "../prompts/compose-canonical-study-inputs";

import { buildCanonicalStudyUserMessage } from "./openai-engine-v3";

function minimalContext(domainId: string): CanonicalStudyContext {
  return {
    schemaVersion: "canonical-study-context/2",
    caseId: "case-1",
    studyRunId: "study-1",
    idempotencyKey: "key-1",
    createdAt: "2026-10-01T00:00:00.000Z",
    domainLabel: "Special education records",
    domainId,
    domainPackId: "domain-pack/iep",
    domainPackVersion: "0.0.0-scaffold",
    domainPackVocabulary: {
      entityTypes: [],
      claimTypes: [],
      relationshipTypes: [],
      eventTypes: [],
    },
    sourceDocuments: [],
    engine1Result: {
      domainLabel: "Special education records",
      domainResolutionStatus: "resolved",
      groups: [],
      documents: [],
      relationships: [],
      missingDocuments: [],
    },
    questionSetVersion: INTAKE_STUDY_QUESTION_SET.id,
    questionSet: INTAKE_STUDY_QUESTION_SET,
    answerSnapshot: INTAKE_STUDY_ANSWER_SNAPSHOT,
    logicalDocuments: [],
    processingPolicy: {
      intentAffectsFacts: false,
      providerId: "test",
      providerMode: "openai",
    },
  };
}

describe("buildCanonicalStudyUserMessage", () => {
  it("includes IEP recognition vocabulary for iep domain runs", () => {
    const prompt = loadCanonicalStudyPrompt("canonical-study-v4");
    const context = minimalContext("iep");
    context.answerSnapshot = {
      ...context.answerSnapshot,
      userContext: { statedWorkPurpose: "My child's IEP is next week — help me prepare" },
    };
    const composed = composeCanonicalStudyPromptInputs(prompt, context);
    const vocabulary = serializeRecognitionVocabularyForPrompt(
      getRecognitionVocabularyByDomainId("iep"),
    );
    const message = buildCanonicalStudyUserMessage(composed, context, {
      recognitionVocabulary: vocabulary,
    });
    expect(message).toContain("Stated work purpose");
    expect(message).toContain("My child's IEP is next week");
    expect(message).toContain("Domain pack (JSON");
    expect(message).toContain("Domain recognition vocabulary");
    expect(message).toContain("Runtime proposal contract");
    expect(message).toContain('"termId": "iep"');
    expect(message).toContain('"IEP"');
    expect(message).toContain("PLAAFP");
    expect(vocabulary.length).toBeGreaterThan(80);
  });

  it("omits recognition vocabulary block when empty", () => {
    const prompt = loadCanonicalStudyPrompt("canonical-study-v4");
    const context = minimalContext("medicaid");
    const composed = composeCanonicalStudyPromptInputs(prompt, context);
    const message = buildCanonicalStudyUserMessage(composed, context, {
      recognitionVocabulary: [],
    });
    expect(message).not.toContain("Domain recognition vocabulary");
  });
});
