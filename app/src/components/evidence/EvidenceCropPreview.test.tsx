import { render, screen } from "@testing-library/react";

import { describe, expect, it, vi } from "vitest";



import type { ResolvedEvidenceRef } from "@hiveforyou/shared/projections";



import { EvidenceCropPreview } from "./EvidenceCropPreview";



vi.mock("@/lib/evidence/use-study-pdf-blob-url", () => ({

  useStudyPdfBlobUrl: () => ({ state: "ready", blobUrl: "blob:mock-pdf" }),

}));



vi.mock("./EvidencePdfPageCanvas", () => ({

  EvidencePdfPageCanvas: ({

    onRenderState,

  }: {

    onRenderState?: (state: "loading" | "ready" | "error") => void;

  }) => {

    onRenderState?.("ready");

    return <div data-testid="evidence-pdf-page-canvas" />;

  },

}));



const ref: ResolvedEvidenceRef = {

  id: "ev-1",

  sourceDocumentId: "doc-1",

  sourceType: "document",

  page: 2,

  sourceFilename: "fba.pdf",

  canonicalTextSnippet: "The observational baseline is 4.25 episodes per week.",

  resolution: "PARTIAL",

};



describe("EvidenceCropPreview", () => {

  it("shows trace pending state before geometry is ready", () => {

    render(

      <EvidenceCropPreview studyRunId="run-1" ref={ref} tracePending onOpen={() => undefined} />,

    );

    expect(screen.getByText(/Pinning this quote on the page/i)).toBeInTheDocument();

  });



  it("renders canvas page preview when blob url is ready", async () => {

    render(<EvidenceCropPreview studyRunId="run-1" ref={ref} onOpen={() => undefined} />);

    expect(await screen.findByTestId("evidence-pdf-page-canvas")).toBeInTheDocument();

  });



  it("shows snippet fallback when no document id", () => {

    render(

      <EvidenceCropPreview

        studyRunId="run-1"

        ref={{ ...ref, sourceDocumentId: "" }}

        onOpen={() => undefined}

      />,

    );

    expect(screen.getByText(/No file linked/i)).toBeInTheDocument();

    expect(screen.getByText(/4.25 episodes per week/i)).toBeInTheDocument();

  });

});

