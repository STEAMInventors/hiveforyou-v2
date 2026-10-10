import { describe, expect, it } from "vitest";

import { TrustedDocumentPagesError } from "./load-trusted-document-pages.js";
import {
  ReaderHttpInvocationError,
  resolveQualificationPipelineFailure,
} from "./reader-qualification-pipeline-error.js";

describe("resolveQualificationPipelineFailure", () => {
  it("preserves trusted document page codes at document load", () => {
    const failure = resolveQualificationPipelineFailure(
      new TrustedDocumentPagesError("missing", "DOCUMENT_PAGES_HASH_MISMATCH"),
      "DOCUMENT_LOAD",
    );
    expect(failure.code).toBe("DOCUMENT_PAGES_HASH_MISMATCH");
  });

  it("falls back per stage for untyped errors", () => {
    expect(resolveQualificationPipelineFailure(new Error("x"), "DOCUMENT_LOAD").code).toBe(
      "DOCUMENT_LOAD_FAILED",
    );
    expect(resolveQualificationPipelineFailure(new Error("x"), "ENGINE1_CONTEXT").code).toBe(
      "ENGINE1_CONTEXT_FAILED",
    );
    expect(resolveQualificationPipelineFailure(new Error("x"), "REQUEST_BUILD").code).toBe(
      "REQUEST_BUILD_FAILED",
    );
    expect(resolveQualificationPipelineFailure(new Error("x"), "READER_HTTP").code).toBe(
      "READER_HTTP_FAILED",
    );
  });

  it("preserves reader HTTP status and error code", () => {
    const failure = resolveQualificationPipelineFailure(
      new ReaderHttpInvocationError(422, "ENGINE1_CONTEXT_MISMATCH"),
      "READER_HTTP",
    );
    expect(failure).toEqual({
      code: "ENGINE1_CONTEXT_MISMATCH",
      httpStatus: 422,
      readerErrorCode: "ENGINE1_CONTEXT_MISMATCH",
    });
  });

  it("parses legacy READER_HTTP_FAILED prefixed messages", () => {
    const failure = resolveQualificationPipelineFailure(
      new Error("READER_HTTP_FAILED:VERIFIER_UNAVAILABLE"),
      "READER_HTTP",
    );
    expect(failure.code).toBe("VERIFIER_UNAVAILABLE");
    expect(failure.readerErrorCode).toBe("VERIFIER_UNAVAILABLE");
  });
});
