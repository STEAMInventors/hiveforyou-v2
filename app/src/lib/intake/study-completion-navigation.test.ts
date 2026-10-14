import { describe, expect, it } from "vitest";

import {
  buildPostStudyCompletionHref,
  isCanonicalStudyPresentationReady,
  isPackDrivenStudyAwaitingRawExtraction,
  resolveStudyProcessingModeFromStudyPath,
} from "./study-completion-navigation";

describe("study-completion-navigation", () => {
  it("maps DOMAIN_PACK intake runs to pack_driven_v1", () => {
    expect(resolveStudyProcessingModeFromStudyPath("DOMAIN_PACK")).toBe("pack_driven_v1");
    expect(resolveStudyProcessingModeFromStudyPath("GENERIC_STUDY")).toBe("canonical_openai_v4");
    expect(resolveStudyProcessingModeFromStudyPath(undefined)).toBe("canonical_openai_v4");
  });

  it("routes pack_driven completion to the study map", () => {
    expect(
      buildPostStudyCompletionHref({
        processingMode: "pack_driven_v1",
        caseId: "case-1",
        studyRunId: "study-1",
      }),
    ).toBe("/study/study-1/map");
  });

  it("routes canonical completion to the study map", () => {
    expect(
      buildPostStudyCompletionHref({
        processingMode: "canonical_openai_v4",
        caseId: "case-1",
        studyRunId: "study-1",
      }),
    ).toBe("/study/study-1/map");
  });

  it("distinguishes canonical presentation readiness from pack-driven polling", () => {
    expect(isCanonicalStudyPresentationReady("SUCCEEDED")).toBe(true);
    expect(isCanonicalStudyPresentationReady("NEEDS_REVIEW")).toBe(true);
    expect(isCanonicalStudyPresentationReady("FAILED")).toBe(false);
    expect(isPackDrivenStudyAwaitingRawExtraction("RUNNING")).toBe(true);
    expect(isPackDrivenStudyAwaitingRawExtraction("SUCCEEDED")).toBe(false);
  });
});
