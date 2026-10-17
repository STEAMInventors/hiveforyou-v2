import { describe, expect, it } from "vitest";

import type { CanonicalStudyReportCustomerBody } from "@hiveforyou/shared/canonical-study-report-projection";

import {
  buildCanonicalStudyHighlights,
  buildCanonicalStudyOverviewParagraph,
  buildCanonicalStudyReadyHeadline,
  resolveCanonicalStudyExperienceState,
  studyRunStatusCustomerLabel,
} from "./canonical-study-experience-model";

const emptyBody: CanonicalStudyReportCustomerBody = {
  storySections: [],
  importantFacts: [],
  changes: [],
  supports: [],
  openQuestions: [],
};

describe("resolveCanonicalStudyExperienceState", () => {
  it("prefers processing over ready content during an in-flight run", () => {
    expect(
      resolveCanonicalStudyExperienceState({
        loading: false,
        hasAcceptedStudyContent: true,
        extractionCompleteForExplore: true,
        canGenerate: true,
        studyRunStatus: "RUNNING",
        generateInFlight: false,
      }),
    ).toBe("processing");
  });

  it("shows study_ready when content exists and run is terminal", () => {
    expect(
      resolveCanonicalStudyExperienceState({
        loading: false,
        hasAcceptedStudyContent: true,
        extractionCompleteForExplore: true,
        canGenerate: true,
        studyRunStatus: "SUCCEEDED",
        generateInFlight: false,
      }),
    ).toBe("study_ready");
  });

  it("shows failure when run failed without accepted content", () => {
    expect(
      resolveCanonicalStudyExperienceState({
        loading: false,
        hasAcceptedStudyContent: false,
        extractionCompleteForExplore: true,
        canGenerate: true,
        studyRunStatus: "FAILED",
        generateInFlight: false,
      }),
    ).toBe("failure");
  });

  it("shows not_ready when extraction is incomplete", () => {
    expect(
      resolveCanonicalStudyExperienceState({
        loading: false,
        hasAcceptedStudyContent: false,
        extractionCompleteForExplore: false,
        canGenerate: false,
        studyRunStatus: "SUCCEEDED",
        generateInFlight: false,
      }),
    ).toBe("not_ready");
  });
});

describe("buildCanonicalStudyHighlights", () => {
  it("returns at most three highlights from changes and important facts", () => {
    const body: CanonicalStudyReportCustomerBody = {
      ...emptyBody,
      changes: [
        {
          relationId: "c1",
          entityId: "e1",
          fieldId: "minutes_per_week",
          label: "CHANGE",
          temporalBasis: null,
          left: {
            claimRef: { fieldKey: "l1" },
            entityId: "e1",
            recordTypeId: "service",
            fieldId: "minutes_per_week",
            sourceDocumentId: "d1",
            displayText: "120 minutes",
            assertionKind: "verified_quoted",
            evidence: [],
          },
          right: {
            claimRef: { fieldKey: "r1" },
            entityId: "e1",
            recordTypeId: "service",
            fieldId: "minutes_per_week",
            sourceDocumentId: "d2",
            displayText: "90 minutes",
            assertionKind: "verified_quoted",
            evidence: [],
          },
        },
      ],
      importantFacts: [
        {
          claimRef: { fieldKey: "f1" },
          entityId: null,
          recordTypeId: "goal",
          fieldId: "statement",
          sourceDocumentId: "d1",
          displayText: "Reading goal on track",
          assertionKind: "verified_quoted",
          evidence: [],
        },
        {
          claimRef: { fieldKey: "f2" },
          entityId: null,
          recordTypeId: "goal",
          fieldId: "statement",
          sourceDocumentId: "d2",
          displayText: "Speech minutes reduced",
          assertionKind: "verified_quoted",
          evidence: [],
        },
        {
          claimRef: { fieldKey: "f3" },
          entityId: null,
          recordTypeId: "goal",
          fieldId: "statement",
          sourceDocumentId: "d3",
          displayText: "Annual review date set",
          assertionKind: "verified_quoted",
          evidence: [],
        },
        {
          claimRef: { fieldKey: "f4" },
          entityId: null,
          recordTypeId: "goal",
          fieldId: "statement",
          sourceDocumentId: "d4",
          displayText: "Extra fact",
          assertionKind: "verified_quoted",
          evidence: [],
        },
      ],
    };

    const highlights = buildCanonicalStudyHighlights(body, 3);
    expect(highlights).toHaveLength(3);
    expect(highlights[0]?.kicker).toBe("Change over time");
    expect(highlights[1]?.title).toBe("Reading goal on track");
  });
});

describe("buildCanonicalStudyOverviewParagraph", () => {
  it("joins important fact display text", () => {
    const paragraph = buildCanonicalStudyOverviewParagraph({
      ...emptyBody,
      importantFacts: [
        {
          claimRef: { fieldKey: "a" },
          entityId: null,
          recordTypeId: "goal",
          fieldId: "statement",
          sourceDocumentId: "d1",
          displayText: "First fact.",
          assertionKind: "verified_quoted",
          evidence: [],
        },
        {
          claimRef: { fieldKey: "b" },
          entityId: null,
          recordTypeId: "goal",
          fieldId: "statement",
          sourceDocumentId: "d2",
          displayText: "Second fact.",
          assertionKind: "verified_quoted",
          evidence: [],
        },
      ],
    });
    expect(paragraph).toBe("First fact. Second fact.");
  });
});

describe("buildCanonicalStudyReadyHeadline", () => {
  it("uses subject first name when present", () => {
    expect(buildCanonicalStudyReadyHeadline("Maya")).toBe("Maya's study overview");
  });
});

describe("studyRunStatusCustomerLabel", () => {
  it("maps queued and running statuses", () => {
    expect(studyRunStatusCustomerLabel("QUEUED")).toBe("Queued");
    expect(studyRunStatusCustomerLabel("RUNNING")).toBe("In progress");
  });
});
