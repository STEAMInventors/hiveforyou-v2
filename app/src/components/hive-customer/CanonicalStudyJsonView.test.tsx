import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CanonicalStudyJsonView } from "./CanonicalStudyJsonView";

vi.mock("./HiveCustomerShell", () => ({
  HiveCustomerShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("next/image", () => ({
  default: (props: { alt: string }) => <img alt={props.alt} />,
}));

describe("CanonicalStudyJsonView", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("shows ready-to-build intro when extraction is complete and no study exists", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("hive-extraction-progress")) {
        return {
          ok: true,
          json: async () => ({
            caseId: "case-1",
            studyRunId: "study-1",
            intakeRunId: "intake-1",
            studyRunStatus: "SUCCEEDED",
            rawExtractionOutcome: "succeeded",
            extractionCompleteForExplore: true,
            extractionTerminal: true,
            subjectFirstName: "Maya",
            documents: [],
            thingsThatWouldHelp: [],
            readDocumentCount: 3,
            totalDetailCount: 10,
          }),
        };
      }
      if (url.includes("canonical-report")) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      if (url.includes("canonical-debug")) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(
      <CanonicalStudyJsonView caseId="case-1" studyRunId="study-1" intakeRunId="intake-1" />,
    );

    expect(await screen.findByTestId("canonical-study-ready-to-build")).toBeInTheDocument();
    expect(screen.getByTestId("canonical-study-build-cta")).toHaveTextContent("Build my study");
  });

  it("opens build confirmation modal from the primary CTA", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("hive-extraction-progress")) {
        return {
          ok: true,
          json: async () => ({
            caseId: "case-1",
            studyRunId: "study-1",
            intakeRunId: null,
            studyRunStatus: "SUCCEEDED",
            rawExtractionOutcome: "succeeded",
            extractionCompleteForExplore: true,
            extractionTerminal: true,
            subjectFirstName: null,
            documents: [],
            thingsThatWouldHelp: [],
            readDocumentCount: 2,
            totalDetailCount: 4,
          }),
        };
      }
      if (url.includes("canonical-report")) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      if (url.includes("canonical-debug")) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const user = userEvent.setup();
    render(<CanonicalStudyJsonView caseId="case-1" studyRunId="study-1" />);
    await screen.findByTestId("canonical-study-build-cta");
    await user.click(screen.getByTestId("canonical-study-build-cta"));
    expect(await screen.findByTestId("canonical-study-build-modal")).toBeInTheDocument();
    expect(screen.getByText("Build your study?")).toBeInTheDocument();
  });

  it("shows processing status from backend while study run is active", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("hive-extraction-progress")) {
        return {
          ok: true,
          json: async () => ({
            caseId: "case-1",
            studyRunId: "study-1",
            intakeRunId: null,
            studyRunStatus: "RUNNING",
            rawExtractionOutcome: "succeeded",
            extractionCompleteForExplore: true,
            extractionTerminal: true,
            subjectFirstName: null,
            documents: [],
            thingsThatWouldHelp: [],
            readDocumentCount: 2,
            totalDetailCount: 4,
          }),
        };
      }
      if (url.includes("canonical-report")) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      if (url.includes("canonical-debug")) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<CanonicalStudyJsonView caseId="case-1" studyRunId="study-1" />);
    const panel = await screen.findByTestId("canonical-study-processing");
    expect(panel).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/In progress/)).toBeInTheDocument();
    });
  });
});
