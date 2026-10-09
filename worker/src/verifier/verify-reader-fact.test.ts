import { request as httpRequest } from "node:http";

import type { DocumentPages } from "@hiveforyou/core/document/page-model";
import { describe, expect, it, afterEach } from "vitest";

import {
  closeVerifierServer,
  createVerifierServer,
  listenVerifierServer,
} from "./server.js";
import {
  verifyReaderFact,
  type ReaderVerifierDeps,
  type ReaderVerifierScope,
} from "./verify-reader-fact.js";

const TOKEN = "test-verifier-token";

function word(text: string, seq: number) {
  return {
    seq,
    text,
    bbox: [0, 0, 10, 10] as [number, number, number, number],
    confidence: 1,
    fontName: null,
    fontSize: null,
    bold: null,
    italic: null,
    source: "native" as const,
  };
}

function fixturePages(): DocumentPages {
  return {
    documentId: "doc-a",
    sha256: "abc",
    pages: [
      {
        documentId: "doc-a",
        pageNumber: 1,
        width: 100,
        height: 100,
        rotation: 0,
        route: "native",
        imageRef: null,
        words: [
          word("Goal:", 0),
          word("Reading", 1),
          word("comprehension", 2),
        ],
        quality: {
          textCoverage: 1,
          meanConfidence: 1,
          garbageRatio: 0,
          illegibleRegions: [],
        },
      },
      {
        documentId: "doc-a",
        pageNumber: 2,
        width: 100,
        height: 100,
        rotation: 0,
        route: "native",
        imageRef: null,
        words: [word("Speech", 0), word("therapy", 1)],
        quality: {
          textCoverage: 1,
          meanConfidence: 1,
          garbageRatio: 0,
          illegibleRegions: [],
        },
      },
    ],
    formFields: [],
  };
}

function depsFromFixtures(input: {
  scope: ReaderVerifierScope;
  pagesByDoc: Record<string, DocumentPages | null>;
  resolveThrows?: boolean;
  loadThrows?: boolean;
}): ReaderVerifierDeps {
  return {
    async resolveScope(caseId, userId) {
      if (input.resolveThrows) {
        throw new Error("resolve failed");
      }
      if (caseId !== input.scope.caseId || userId !== input.scope.userId) {
        return null;
      }
      return input.scope;
    },
    async loadDocumentPages(_userId, sourceDocumentId) {
      if (input.loadThrows) {
        throw new Error("load failed");
      }
      return input.pagesByDoc[sourceDocumentId] ?? null;
    },
  };
}

function httpJson(input: {
  port: number;
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<{ status: number; text: string }> {
  return new Promise((resolvePromise, reject) => {
    const req = httpRequest(
      {
        hostname: "127.0.0.1",
        port: input.port,
        path: input.path,
        method: input.method,
        headers: input.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolvePromise({
            status: res.statusCode ?? 0,
            text: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    if (input.body) {
      req.write(input.body);
    }
    req.end();
  });
}

describe("verifyReaderFact", () => {
  const scope: ReaderVerifierScope = {
    caseId: "case-1",
    userId: "user-1",
    domainId: "iep",
    authorizedSourceDocumentIds: ["doc-a"],
  };

  it("accepts a correct quote on the correct page", async () => {
    const result = await verifyReaderFact(
      {
        caseId: "case-1",
        userId: "user-1",
        evidence: [
          {
            sourceDocumentId: "doc-a",
            page: 1,
            quote: "Reading comprehension",
            spanStart: 1,
            spanEnd: 2,
          },
        ],
      },
      depsFromFixtures({ scope, pagesByDoc: { "doc-a": fixturePages() } }),
    );
    expect(result.accepted).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.verifiedEvidence[0]?.page).toBe(1);
  });

  it("rejects an incorrect quote", async () => {
    const result = await verifyReaderFact(
      {
        caseId: "case-1",
        userId: "user-1",
        evidence: [{ sourceDocumentId: "doc-a", page: 1, quote: "Not present" }],
      },
      depsFromFixtures({ scope, pagesByDoc: { "doc-a": fixturePages() } }),
    );
    expect(result.accepted).toBe(false);
    expect(result.reasons[0]).toMatch(/does not match/i);
  });

  it("rejects a correct quote on the wrong page", async () => {
    const result = await verifyReaderFact(
      {
        caseId: "case-1",
        userId: "user-1",
        evidence: [{ sourceDocumentId: "doc-a", page: 2, quote: "Reading comprehension" }],
      },
      depsFromFixtures({ scope, pagesByDoc: { "doc-a": fixturePages() } }),
    );
    expect(result.accepted).toBe(false);
  });

  it("rejects an invalid span", async () => {
    const result = await verifyReaderFact(
      {
        caseId: "case-1",
        userId: "user-1",
        evidence: [
          {
            sourceDocumentId: "doc-a",
            page: 1,
            quote: "Reading comprehension",
            spanStart: 0,
            spanEnd: 0,
          },
        ],
      },
      depsFromFixtures({ scope, pagesByDoc: { "doc-a": fixturePages() } }),
    );
    expect(result.accepted).toBe(false);
    expect(result.reasons[0]).toMatch(/spanStart/i);
  });

  it("rejects unknown documents", async () => {
    const result = await verifyReaderFact(
      {
        caseId: "case-1",
        userId: "user-1",
        evidence: [{ sourceDocumentId: "doc-unknown", page: 1, quote: "Reading" }],
      },
      depsFromFixtures({ scope, pagesByDoc: { "doc-a": fixturePages() } }),
    );
    expect(result.accepted).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/unknown|not authorized/i);
  });

  it("rejects cross-case document references", async () => {
    const otherScope: ReaderVerifierScope = {
      ...scope,
      authorizedSourceDocumentIds: ["doc-b"],
    };
    const otherPages: DocumentPages = {
      ...fixturePages(),
      documentId: "doc-b",
      pages: fixturePages().pages.map((p) => ({ ...p, documentId: "doc-b" })),
    };
    const result = await verifyReaderFact(
      {
        caseId: "case-1",
        userId: "user-1",
        evidence: [{ sourceDocumentId: "doc-a", page: 1, quote: "Reading comprehension" }],
      },
      depsFromFixtures({ scope: otherScope, pagesByDoc: { "doc-b": otherPages } }),
    );
    expect(result.accepted).toBe(false);
  });

  it("does not accept spoofed verificationStatus without quote proof", async () => {
    const result = await verifyReaderFact(
      {
        caseId: "case-1",
        userId: "user-1",
        verificationStatus: "verified",
        evidence: [{ sourceDocumentId: "doc-a", page: 1, quote: "bogus quote" }],
      },
      depsFromFixtures({ scope, pagesByDoc: { "doc-a": fixturePages() } }),
    );
    expect(result.accepted).toBe(false);
  });

  it("fails closed when scope resolution throws", async () => {
    const result = await verifyReaderFact(
      {
        caseId: "case-1",
        userId: "user-1",
        evidence: [{ sourceDocumentId: "doc-a", page: 1, quote: "Reading comprehension" }],
      },
      depsFromFixtures({
        scope,
        pagesByDoc: { "doc-a": fixturePages() },
        resolveThrows: true,
      }),
    );
    expect(result.accepted).toBe(false);
    expect(result.reasons[0]).toMatch(/scope/i);
  });

  it("fails closed when document pages cannot be loaded", async () => {
    const result = await verifyReaderFact(
      {
        caseId: "case-1",
        userId: "user-1",
        evidence: [{ sourceDocumentId: "doc-a", page: 1, quote: "Reading comprehension" }],
      },
      depsFromFixtures({
        scope,
        pagesByDoc: { "doc-a": fixturePages() },
        loadThrows: true,
      }),
    );
    expect(result.accepted).toBe(false);
    expect(result.reasons[0]).toMatch(/load/i);
  });
});

describe("reader verifier HTTP server", () => {
  afterEach(() => {
    // closed in withServer
  });

  async function withServer(
    deps: ReaderVerifierDeps,
    fn: (port: number) => Promise<void>,
  ): Promise<void> {
    const server = createVerifierServer({ token: TOKEN, deps });
    const { port } = await listenVerifierServer(server, { host: "127.0.0.1", port: 0 });
    try {
      await fn(port);
    } finally {
      await closeVerifierServer(server);
    }
  }

  it("requires authentication", async () => {
    const scope: ReaderVerifierScope = {
      caseId: "case-1",
      userId: "user-1",
      domainId: "iep",
      authorizedSourceDocumentIds: ["doc-a"],
    };
    await withServer(depsFromFixtures({ scope, pagesByDoc: { "doc-a": fixturePages() } }), async (port) => {
      const res = await httpJson({
        port,
        method: "POST",
        path: "/verifier/reader-fact",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: "case-1",
          userId: "user-1",
          evidence: [{ sourceDocumentId: "doc-a", page: 1, quote: "Reading comprehension" }],
        }),
      });
      expect(res.status).toBe(401);
    });
  });

  it("fails closed on malformed JSON response path", async () => {
    const scope: ReaderVerifierScope = {
      caseId: "case-1",
      userId: "user-1",
      domainId: "iep",
      authorizedSourceDocumentIds: ["doc-a"],
    };
    await withServer(depsFromFixtures({ scope, pagesByDoc: { "doc-a": fixturePages() } }), async (port) => {
      const res = await httpJson({
        port,
        method: "POST",
        path: "/verifier/reader-fact",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TOKEN}`,
        },
        body: "{",
      });
      expect(res.status).toBe(400);
    });
  });
});
