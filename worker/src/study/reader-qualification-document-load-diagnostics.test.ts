import { describe, expect, it, vi } from "vitest";

import { TrustedDocumentPagesError } from "./load-trusted-document-pages.js";
import {
  buildDocumentLoadFailureDiagnostic,
  categorizeUntypedDocumentLoadError,
  recordDocumentLoadFailureDiagnostic,
  summarizeRegisteredDocuments,
} from "./reader-qualification-document-load-diagnostics.js";

describe("document load diagnostics", () => {
  it("summarizes eight registered L001 documents", () => {
    const docs = Array.from({ length: 8 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      sha256: "a".repeat(64),
    }));
    expect(summarizeRegisteredDocuments(docs)).toEqual({
      registeredDocumentCount: 8,
      expectedDocumentCount: 8,
      allEightRegistered: true,
    });
  });

  it("maps trusted page errors to categories", () => {
    const summary = summarizeRegisteredDocuments([{ id: "doc-1", sha256: "b".repeat(64) }]);
    const diagnostic = buildDocumentLoadFailureDiagnostic({
      summary,
      operation: "CACHE_PAYLOAD_ASSERT",
      error: new TrustedDocumentPagesError("x", "DOCUMENT_PAGES_HASH_MISMATCH"),
      sourceDocumentId: "doc-1",
      documentIndex: 2,
      bundlesLoadedBeforeFailure: 2,
    });
    expect(diagnostic).toMatchObject({
      operation: "CACHE_PAYLOAD_ASSERT",
      errorCategory: "sha_mismatch",
      trustedPagesCode: "DOCUMENT_PAGES_HASH_MISMATCH",
      sourceDocumentId: "doc-1",
      documentIndex: 2,
      bundlesLoadedBeforeFailure: 2,
    });
  });

  it("classifies L001 filename map failures as metadata or filesystem", () => {
    expect(
      categorizeUntypedDocumentLoadError(
        new Error("L001_QUALIFICATION_SOURCE_DOCUMENT_FILENAME_MAP_INCOMPLETE"),
      ),
    ).toMatchObject({
      operation: "L001_FILENAME_MAP",
      errorCategory: "metadata",
    });
    expect(
      categorizeUntypedDocumentLoadError(
        new Error("L001_QUALIFICATION_MANIFEST_MISSING:/app/pack/l001-qualification-manifest.json"),
      ),
    ).toMatchObject({
      operation: "L001_FILENAME_MAP",
      errorCategory: "filesystem",
    });
    expect(
      categorizeUntypedDocumentLoadError(
        new Error("L001_QUALIFICATION_MANIFEST_PIN_MISMATCH:/app/pack/l001-qualification-manifest.json"),
      ),
    ).toMatchObject({
      operation: "L001_FILENAME_MAP",
      errorCategory: "metadata",
    });
    const errnoError = new Error("missing manifest") as NodeJS.ErrnoException;
    errnoError.code = "ENOENT";
    expect(categorizeUntypedDocumentLoadError(errnoError)).toMatchObject({
      operation: "L001_FILENAME_MAP",
      errorCategory: "filesystem",
    });
  });

  it("logs safe diagnostic fields only", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    recordDocumentLoadFailureDiagnostic(
      buildDocumentLoadFailureDiagnostic({
        summary: {
          registeredDocumentCount: 8,
          expectedDocumentCount: 8,
          allEightRegistered: true,
        },
        operation: "L001_FILENAME_MAP",
        error: new Error("L001_QUALIFICATION_SOURCE_DOCUMENT_FILENAME_MAP_INCOMPLETE"),
        bundlesLoadedBeforeFailure: 8,
      }),
    );
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});