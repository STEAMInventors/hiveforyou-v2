import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { request as httpRequest } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, afterEach } from "vitest";

import type { GradeResult } from "../grade.js";
import { proposalFromStudyBaseline } from "../eval/baseline-proposal.js";
import type { StudyBaseline } from "../eval/baseline-types.js";
import {
  closeGraderServer,
  createGraderServer,
  listenGraderServer,
} from "./grader-server.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const evalRoot = resolve(testDir, "../..");
const repoRoot = resolve(evalRoot, "../..");

const TOKEN = "test-grader-token-local";

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

async function withServer(
  options: Partial<{ evalRoot: string; maxBodyBytes: number }>,
  fn: (port: number) => Promise<void>,
): Promise<void> {
  const server = createGraderServer({
    token: TOKEN,
    repoRoot,
    evalRoot: options.evalRoot ?? evalRoot,
    maxBodyBytes: options.maxBodyBytes,
  });
  const { port } = await listenGraderServer(server, { host: "127.0.0.1", port: 0 });
  try {
    await fn(port);
  } finally {
    await closeGraderServer(server);
  }
}

function l001ProposalFromBaselineV41(): unknown {
  const baseline = JSON.parse(
    readFileSync(join(evalRoot, "baselines/l001-v4.1.json"), "utf8"),
  ) as StudyBaseline;
  return proposalFromStudyBaseline(baseline);
}

function authHeaders(token = TOKEN): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

describe("grader HTTP server", () => {
  afterEach(() => {
    // servers closed in withServer
  });

  it("A. GET /health => 200", async () => {
    await withServer({}, async (port) => {
      const res = await httpJson({ port, method: "GET", path: "/health" });
      expect(res.status).toBe(200);
      expect(JSON.parse(res.text)).toEqual({ ok: true });
    });
  });

  it("B. POST /eval/grade without auth => 401", async () => {
    await withServer({}, async (port) => {
      const res = await httpJson({
        port,
        method: "POST",
        path: "/eval/grade",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: "l001", proposal: l001ProposalFromBaselineV41() }),
      });
      expect(res.status).toBe(401);
    });
  });

  it("C. wrong token => 401", async () => {
    await withServer({}, async (port) => {
      const res = await httpJson({
        port,
        method: "POST",
        path: "/eval/grade",
        headers: authHeaders("wrong-token"),
        body: JSON.stringify({ caseId: "l001", proposal: l001ProposalFromBaselineV41() }),
      });
      expect(res.status).toBe(401);
    });
  });

  it("D. invalid JSON => 400", async () => {
    await withServer({}, async (port) => {
      const res = await httpJson({
        port,
        method: "POST",
        path: "/eval/grade",
        headers: authHeaders(),
        body: "{not-json",
      });
      expect(res.status).toBe(400);
      expect(JSON.parse(res.text).error.code).toBe("INVALID_JSON");
    });
  });

  it("E. missing caseId => 400", async () => {
    await withServer({}, async (port) => {
      const res = await httpJson({
        port,
        method: "POST",
        path: "/eval/grade",
        headers: authHeaders(),
        body: JSON.stringify({ proposal: l001ProposalFromBaselineV41() }),
      });
      expect(res.status).toBe(400);
    });
  });

  it("F. missing proposal => 400", async () => {
    await withServer({}, async (port) => {
      const res = await httpJson({
        port,
        method: "POST",
        path: "/eval/grade",
        headers: authHeaders(),
        body: JSON.stringify({ caseId: "l001" }),
      });
      expect(res.status).toBe(400);
    });
  });

  it("G. unknown case => 404", async () => {
    await withServer({}, async (port) => {
      const res = await httpJson({
        port,
        method: "POST",
        path: "/eval/grade",
        headers: authHeaders(),
        body: JSON.stringify({
          caseId: "no-such-case-xyz",
          proposal: l001ProposalFromBaselineV41(),
        }),
      });
      expect(res.status).toBe(404);
      expect(JSON.parse(res.text).error.code).toBe("CASE_NOT_FOUND");
    });
  });

  it("H. unverified golden refused", async () => {
    const tempEvalRoot = mkdtempSync(join(tmpdir(), "hive-eval-golden-"));
    const tuneDir = join(tempEvalRoot, "golden", "tune");
    mkdirSync(tuneDir, { recursive: true });
    writeFileSync(
      join(tuneDir, "draftonly.json"),
      JSON.stringify({
        caseId: "draftonly",
        split: "tune",
        corpusDir: "engine/intake/fixtures/l001",
        verifiedBy: null,
        draft: true,
        facts: [],
        gaps: [],
        tripwires: [],
      }),
      "utf8",
    );
    await withServer({ evalRoot: tempEvalRoot }, async (port) => {
      const res = await httpJson({
        port,
        method: "POST",
        path: "/eval/grade",
        headers: authHeaders(),
        body: JSON.stringify({
          caseId: "draftonly",
          proposal: l001ProposalFromBaselineV41(),
        }),
      });
      expect(res.status).toBe(422);
      expect(JSON.parse(res.text).error.code).toBe("GOLDEN_NOT_CERTIFIED");
    });
  });

  it("I–J. valid L001 proposal => 200 GradeResult with expected fields", async () => {
    await withServer({}, async (port) => {
      const res = await httpJson({
        port,
        method: "POST",
        path: "/eval/grade",
        headers: authHeaders(),
        body: JSON.stringify({
          caseId: "l001",
          proposal: l001ProposalFromBaselineV41(),
        }),
      });
      expect(res.status).toBe(200);
      const grade = JSON.parse(res.text) as GradeResult;
      expect(typeof grade.score).toBe("number");
      expect(grade.metrics).toBeDefined();
      expect(Array.isArray(grade.failures)).toBe(true);
      expect(Array.isArray(grade.feedback)).toBe(true);
    });
  });

  it("K. same request twice => deterministic identical GradeResult", async () => {
    await withServer({}, async (port) => {
      const body = JSON.stringify({
        caseId: "l001",
        proposal: l001ProposalFromBaselineV41(),
      });
      const a = await httpJson({
        port,
        method: "POST",
        path: "/eval/grade",
        headers: authHeaders(),
        body,
      });
      const b = await httpJson({
        port,
        method: "POST",
        path: "/eval/grade",
        headers: authHeaders(),
        body,
      });
      expect(a.text).toBe(b.text);
    });
  });

  it("L. unsupported method => 405", async () => {
    await withServer({}, async (port) => {
      const res = await httpJson({ port, method: "GET", path: "/eval/grade" });
      expect(res.status).toBe(405);
    });
  });

  it("M. unknown route => 404", async () => {
    await withServer({}, async (port) => {
      const res = await httpJson({ port, method: "GET", path: "/nope" });
      expect(res.status).toBe(404);
    });
  });

  it("N. oversized payload => 413", async () => {
    await withServer({ maxBodyBytes: 32 }, async (port) => {
      const res = await httpJson({
        port,
        method: "POST",
        path: "/eval/grade",
        headers: authHeaders(),
        body: "x".repeat(64),
      });
      expect(res.status).toBe(413);
    });
  });

  it("O. token never appears in response body", async () => {
    await withServer({}, async (port) => {
      const res = await httpJson({
        port,
        method: "POST",
        path: "/eval/grade",
        headers: authHeaders(),
        body: JSON.stringify({
          caseId: "l001",
          proposal: l001ProposalFromBaselineV41(),
        }),
      });
      expect(res.text.includes(TOKEN)).toBe(false);
    });
  });
});
