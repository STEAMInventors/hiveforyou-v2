import { describe, expect, it, vi } from "vitest";

import {
  JEV_DECIDE_URL,
  JevRequestError,
  buildJevIdentityRequest,
  decideDocumentIdentity,
  parseJevIdentityResponse,
} from "./jev-client";

const sample = "Form 1040 U.S. Individual Income Tax Return wages and taxable income for the year.";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Jev document identity client", () => {
  it("sends document text as state and does not include a filename", () => {
    const filename = "iep-renamed-bank_statement.pdf";
    const request = buildJevIdentityRequest(sample);
    const serialized = JSON.stringify(request);
    expect(request.state).toBe(sample);
    expect(typeof request.state).toBe("string");
    expect(serialized).not.toContain(filename);
    expect(serialized).not.toContain("filename");
    expect(serialized).not.toContain("originalFilename");
    expect(serialized).not.toContain('"model"');
    expect(Object.keys(request).sort()).toEqual(["questions", "state"]);
    expect(request.questions.document_identity.instructions).toBe(
      "Identify what this document actually is based only on the document itself.",
    );
    expect(request.questions.document_identity.criteria.bank_statement).toBeTruthy();
    expect(request.questions.document_identity.criteria.tax_return).toBeTruthy();
    expect(request.questions.document_identity.criteria.iep_document).toBeTruthy();
  });

  it("accepts bank_statement, tax_return, and iep_document without a model field", () => {
    for (const choice of ["bank_statement", "tax_return", "iep_document"] as const) {
      const decision = parseJevIdentityResponse({
        answers: { document_identity: { choice, confidence: choice === "tax_return" ? 0.85 : 1 } },
        usage: { cost_usd: 0.01 },
      });
      expect(decision.choice).toBe(choice);
      expect(decision.returnedModel).toBeNull();
      expect(decision.classifierVersion).toBeNull();
    }
  });

  it("keeps a returned model identifier when Jev supplies one", () => {
    const decision = parseJevIdentityResponse({
      model: "jev-1.13.0",
      answers: { document_identity: { choice: "bank_statement", confidence: 1 } },
    });
    expect(decision.returnedModel).toBe("jev-1.13.0");
    expect(decision.classifierVersion).toBeNull();
  });

  it("keeps a classifier version when Jev supplies classifier_version", () => {
    const decision = parseJevIdentityResponse({
      model: "jev-runtime",
      classifier_version: "1.13.0",
      answers: { document_identity: { choice: "bank_statement", confidence: 1 } },
    });
    expect(decision.returnedModel).toBe("jev-runtime");
    expect(decision.classifierVersion).toBe("1.13.0");
  });

  it("rejects an unknown choice instead of coercing it to other", () => {
    expect(() =>
      parseJevIdentityResponse({
        answers: { document_identity: { choice: "mystery", confidence: 1 } },
      }),
    ).toThrow(JevRequestError);
  });

  it("does not call Jev with an empty sample", async () => {
    const fetchImpl = vi.fn();
    await expect(
      decideDocumentIdentity({ apiKey: "secret", fetchImpl: fetchImpl as typeof fetch }, "   "),
    ).rejects.toMatchObject({ errorCode: "JEV_INVALID_RESPONSE" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("maps HTTP 400 to rejection and does not invent a type", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "bad" }, 400));
    await expect(
      decideDocumentIdentity({ apiKey: "secret", fetchImpl: fetchImpl as typeof fetch }, sample),
    ).rejects.toMatchObject({ errorCode: "JEV_REJECTED" });
    expect(fetchImpl).toHaveBeenCalledWith(
      JEV_DECIDE_URL,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer secret" }),
      }),
    );
    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit] | undefined;
    const body = String(call?.[1]?.body);
    expect(body).not.toContain("statement.pdf");
    expect(body).not.toContain('"model"');
    expect(JSON.parse(body)).toEqual(buildJevIdentityRequest(sample));
  });

  it("maps an aborted request to timeout", async () => {
    const fetchImpl = vi.fn(async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    });
    await expect(
      decideDocumentIdentity(
        { apiKey: "secret", fetchImpl: fetchImpl as typeof fetch, timeoutMs: 5 },
        sample,
      ),
    ).rejects.toMatchObject({ errorCode: "JEV_TIMEOUT" });
  });

  it("does not call the network without an API key", async () => {
    const fetchImpl = vi.fn();
    await expect(
      decideDocumentIdentity({ apiKey: "  ", fetchImpl: fetchImpl as typeof fetch }, sample),
    ).rejects.toMatchObject({ errorCode: "JEV_UNAVAILABLE" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
