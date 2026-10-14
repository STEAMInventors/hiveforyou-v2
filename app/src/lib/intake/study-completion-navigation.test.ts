import { describe, expect, it } from "vitest";

import {
  buildPostStudyCompletionHref,
  isCanonicalPresentationReady,
  isCanonicalStudyPresentationReady,
  isPackDrivenStudyAwaitingRawExtraction,
  isRawExtractionSucceeded,
  isStudyWorkspaceCompletionReady,
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

  it("treats pack-driven SUCCEEDED without case map as raw extraction complete", () => {
    const rawExtractionOnly = {
      processingMode: "pack_driven_v1" as const,
      status: "SUCCEEDED" as const,
      caseMap: null,
      projectionsPending: false,
    };
    expect(isRawExtractionSucceeded(rawExtractionOnly)).toBe(true);
    expect(isCanonicalPresentationReady(rawExtractionOnly)).toBe(false);
    expect(isStudyWorkspaceCompletionReady(rawExtractionOnly)).toBe(true);
  });

  it("treats canonical SUCCEEDED with case map as presentation ready", () => {
    const withProjections = {
      processingMode: "canonical_openai_v4" as const,
      status: "SUCCEEDED" as const,
      caseMap: { schemaVersion: "case-map/1" } as never,
      projectionsPending: false,
    };
    expect(isRawExtractionSucceeded(withProjections)).toBe(false);
    expect(isCanonicalPresentationReady(withProjections)).toBe(true);
    expect(isStudyWorkspaceCompletionReady(withProjections)).toBe(true);
  });

  it("does not treat canonical SUCCEEDED with pending projections as workspace complete", () => {
    const pending = {
      processingMode: "canonical_openai_v4" as const,
      status: "SUCCEEDED" as const,
      caseMap: null,
      projectionsPending: true,
    };
    expect(isStudyWorkspaceCompletionReady(pending)).toBe(false);
  });

  it("treats pack-driven SUCCEEDED without case map as complete even when projections are pending", () => {
    const packPending = {
      processingMode: "pack_driven_v1" as const,
      status: "SUCCEEDED" as const,
      caseMap: null,
      projectionsPending: true,
    };
    expect(isRawExtractionSucceeded(packPending)).toBe(true);
    expect(isStudyWorkspaceCompletionReady(packPending)).toBe(true);
  });
});
