import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { loadBundledPromptContent } from "./load-prompt-content";

import { freezeCanonicalStudyContext } from "../study/freeze-context";
import { resolveDomainPackFromDiscoveryLabel } from "@hiveforyou/domain-packs";
import type { StartCanonicalStudyRequest } from "@hiveforyou/shared/canonical-study";

import { composeCanonicalStudyPromptInputs } from "./compose-canonical-study-inputs";
import {
  UnknownPromptVersionError,
  isV4PromptVersion,
  loadCanonicalStudyPrompt,
} from "./load-canonical-study-prompt";

function request(): StartCanonicalStudyRequest {
  return {
    caseId: "case-1",
    sourceDocuments: [
      {
        stagedDocumentId: "doc-1",
        originalFilename: "iep_2024.pdf",
        sizeBytes: 10,
      },
    ],
    engine1Result: {
      domainLabel: "Special education records",
      domainResolutionStatus: "resolved",
      groups: [],
      documents: [],
      relationships: [],
      missingDocuments: [],
    },
    questionSet: { id: "qs", questions: [] },
    answerSnapshot: {
      questionSetId: "qs",
      answers: {},
      missingNodeStates: {},
      ambiguityNodeStates: {},
      analysisIntent: null,
      userContext: null,
    },
  };
}

describe("loadCanonicalStudyPrompt", () => {
  it("reads the requested versioned prompt file and returns its hash", () => {
    const loaded = loadCanonicalStudyPrompt("canonical-study-v1");
    const content = loadBundledPromptContent("canonical-study/canonical-study-v1.md");
    expect(loaded).toEqual({
      id: "canonical-study",
      version: "v1",
      content,
      sha256: createHash("sha256").update(content).digest("hex"),
    });
    expect(loaded.content).toContain("Model proposes.");
    expect(loaded.content).toContain("No chip, no claim.");
    expect(loaded.content).not.toContain("iep_2024.pdf");
    expect(loadCanonicalStudyPrompt("v1").sha256).toBe(loaded.sha256);
  });

  it("loads canonical-study-v4 methodology prompt", () => {
    const loaded = loadCanonicalStudyPrompt("canonical-study-v4");
    expect(loaded.version).toBe("v4");
    expect(loaded.content).toContain("canonical-study-proposal/3");
    expect(loaded.content).toContain("Runtime JSON contract");
  });

  it("loads canonical-study-v4.1 with a stable sha", () => {
    const a = loadCanonicalStudyPrompt("canonical-study-v4.1");
    expect(a.version).toBe("v4.1");
    expect(loadCanonicalStudyPrompt("v4.1").sha256).toBe(a.sha256);
    expect(a.sha256).toBe(
      createHash("sha256")
        .update(loadBundledPromptContent("canonical-study/canonical-study-v4.1.md"))
        .digest("hex"),
    );
  });

  it("v4.1 matches the v4 schema vocabulary", () => {
    const content = loadCanonicalStudyPrompt("canonical-study-v4.1").content;
    expect(content).toContain("canonical-study-proposal/4");
    expect(content).toContain("`modality`");
    expect(content).toContain("`quote`");
    expect(content).toContain("gapKind");
    expect(content).toContain("field_present_but_empty");
    expect(content).toContain("not_found_in_supplied_documents");
    expect(content).not.toContain("snippet");
    expect(content).not.toContain("Do not use `gapKind`");
    expect(content).not.toContain("canonical-study-proposal/3");
    expect(content).not.toContain("`role`");
  });

  it("isV4PromptVersion", () => {
    expect(isV4PromptVersion("v4")).toBe(true);
    expect(isV4PromptVersion("v4.1")).toBe(true);
    expect(isV4PromptVersion("v3")).toBe(false);
    expect(isV4PromptVersion("v40")).toBe(false);
    expect(isV4PromptVersion("")).toBe(false);
  });

  it("loads canonical-study-v3 methodology prompt", () => {
    const loaded = loadCanonicalStudyPrompt("canonical-study-v3");
    expect(loaded.version).toBe("v3");
    expect(loaded.content).toContain("canonical-study-proposal/3");
    expect(loaded.content.toLowerCase()).toContain("no construct allowlist");
    expect(loaded.content).toContain("snake_case");
  });

  it("fails closed for an unknown prompt version", () => {
    expect(() => loadCanonicalStudyPrompt("v9")).toThrow(UnknownPromptVersionError);
    expect(() => loadCanonicalStudyPrompt("latest")).toThrow(UnknownPromptVersionError);
  });

  it("keeps case-specific inputs outside the base prompt", () => {
    const prompt = loadCanonicalStudyPrompt("v1");
    const pack = resolveDomainPackFromDiscoveryLabel("Special education records");
    expect(pack).not.toBeNull();
    const context = freezeCanonicalStudyContext({
      request: request(),
      studyRunId: "run-1",
      resolvedPack: pack!,
      idempotencyKey: "key",
      providerId: "fixture-canonical-study-engine",
      providerMode: "fixture",
      prompt,
    });
    const composed = composeCanonicalStudyPromptInputs(prompt, context);
    expect(composed.system).toBe(prompt.content);
    expect(composed.system).not.toContain("iep_2024.pdf");
    expect(composed.evidenceReferences[0]?.originalFilename).toBe("iep_2024.pdf");
    expect(composed.outputSchema).toBe("canonical-study-proposal/2");
    expect(JSON.stringify(composed.evidenceReferences)).not.toContain("%PDF");
  });
});
