import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { StartCanonicalStudyRequest } from "@hiveforyou/shared/canonical-study";

import {
  FixtureCanonicalStudyEngine,
  InMemoryStudyContextRepository,
  InMemoryStudyRunEventRepository,
  InMemoryStudyRunRepository,
  loadCanonicalStudyPrompt,
  runCanonicalStudy,
} from "@hiveforyou/core";
import { InMemoryCaseIntelligenceRepository } from "@hiveforyou/canonical";

import { StudyExperience } from "./StudyExperience";

const FIXTURE_FORBIDDEN_ON_STUDY = ["FIXTURE:", "record_statement", "diagnosis"];

function minimalRequest(): StartCanonicalStudyRequest {
  return {
    caseId: "case-ui-test",
    sourceDocuments: [
      {
        stagedDocumentId: "s1",
        discoveryDocumentId: "doc-s1",
        originalFilename: "file.pdf",
        sizeBytes: 1,
      },
    ],
    engine1Result: {
      domainLabel: "Special education records",
      domainResolutionStatus: "resolved",
      groups: [],
      documents: [
        {
          id: "doc-s1",
          stagedDocumentId: "s1",
          documentType: "Doc",
          title: "Doc",
          originalFilename: "file.pdf",
          sizeBytes: 1,
          familyRole: "f",
          groupId: "g",
          recognitionStatus: "recognized",
        },
      ],
      relationships: [],
      missingDocuments: [],
    },
    questionSet: {
      id: "qs",
      questions: [
        {
          id: "q1",
          prompt: "p",
          required: true,
          answerKind: "single_choice",
          affectsCanonicalTruth: true,
          affectsAnalysis: true,
          affectsProjection: true,
        },
      ],
    },
    answerSnapshot: {
      questionSetId: "qs",
      answers: {
        q1: {
          questionId: "q1",
          value: { choiceId: "a" },
          status: "answered",
          updatedAt: new Date().toISOString(),
        },
      },
      missingNodeStates: {},
      ambiguityNodeStates: {},
      analysisIntent: null,
      userContext: null,
    },
  };
}

describe("StudyExperience UI", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        const outcome = await runCanonicalStudy(body, {
          engine: new FixtureCanonicalStudyEngine(),
          providerId: "fixture-canonical-study-engine",
          providerMode: "fixture",
          prompt: loadCanonicalStudyPrompt("canonical-study-v3"),
          contextRepo: new InMemoryStudyContextRepository(),
          runRepo: new InMemoryStudyRunRepository(),
          eventRepo: new InMemoryStudyRunEventRepository(),
          intelligenceRepo: new InMemoryCaseIntelligenceRepository(),
          inFlight: new Map(),
        });
        return {
          ok: true,
          json: async () => outcome,
        } as Response;
      }),
    );
  });

  it("shows human stages only while running", async () => {
    render(<StudyExperience startRequest={minimalRequest()} />);
    expect(screen.getByTestId("study-stage-label")).toHaveTextContent("Hiving");
    expect(screen.getByTestId("hive-building-stage-current")).toHaveTextContent(
      /Reading your documents together|Connecting facts across files/,
    );
    await waitFor(
      () => {
        expect(screen.getByText("Your case study is ready.")).toBeInTheDocument();
      },
      { timeout: 8000 },
    );
  });

  it("exits processing after successful application response when Strict Mode remounts mid-flight", async () => {
    let releaseFetch: () => void;
    const fetchGate = new Promise<void>((resolve) => {
      releaseFetch = () => resolve();
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        await fetchGate;
        const body = JSON.parse(String(init?.body));
        const outcome = await runCanonicalStudy(body, {
          engine: new FixtureCanonicalStudyEngine(),
          providerId: "fixture-canonical-study-engine",
          providerMode: "fixture",
          prompt: loadCanonicalStudyPrompt("canonical-study-v3"),
          contextRepo: new InMemoryStudyContextRepository(),
          runRepo: new InMemoryStudyRunRepository(),
          eventRepo: new InMemoryStudyRunEventRepository(),
          intelligenceRepo: new InMemoryCaseIntelligenceRepository(),
          inFlight: new Map(),
        });
        return {
          ok: true,
          json: async () => outcome,
        } as Response;
      }),
    );

    render(
      <StrictMode>
        <StudyExperience startRequest={minimalRequest()} />
      </StrictMode>,
    );
    expect(screen.getByTestId("study-stage-label")).toBeInTheDocument();

    releaseFetch!();

    await waitFor(
      () => {
        expect(screen.getByTestId("study-continue-case")).toBeInTheDocument();
        expect(screen.getByText("Your case study is ready.")).toBeInTheDocument();
      },
      { timeout: 8000 },
    );
  });

  it("does not surface engine findings or fixture claim text on study screen", async () => {
    render(<StudyExperience startRequest={minimalRequest()} />);
    await waitFor(
      () => {
        expect(screen.getByTestId("study-continue-case")).toBeInTheDocument();
      },
      { timeout: 8000 },
    );
    const text = document.body.textContent ?? "";
    for (const snippet of FIXTURE_FORBIDDEN_ON_STUDY) {
      expect(text).not.toContain(snippet);
    }
  });
});
