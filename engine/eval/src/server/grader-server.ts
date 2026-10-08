import { createServer, type Server } from "node:http";

import { validateCanonicalStudyProposalV4 } from "@hiveforyou/shared/case-intelligence/4";

import { resolveCertifiedGoldenByCaseId } from "../eval/resolve-certified-golden.js";
import { loadGradeCorpusForGolden } from "../eval/load-grade-corpus.js";
import { gradeGoldenProposal, GoldenNotCertifiedError } from "../grade.js";
import { isAuthorized } from "./auth.js";
import { apiError, type ApiErrorBody } from "./http-errors.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024;

export type GraderServerOptions = {
  token: string;
  repoRoot: string;
  evalRoot: string;
  host?: string;
  port?: number;
  maxBodyBytes?: number;
};

function sendJson(
  res: import("node:http").ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(payload);
}

function readRequestBody(
  req: import("node:http").IncomingMessage,
  maxBytes: number,
): Promise<{ ok: true; text: string } | { ok: false; code: "PAYLOAD_TOO_LARGE" }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let tooLarge = false;
    req.on("data", (chunk: Buffer) => {
      if (tooLarge) {
        return;
      }
      total += chunk.length;
      if (total > maxBytes) {
        tooLarge = true;
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) {
        resolve({ ok: false, code: "PAYLOAD_TOO_LARGE" });
        return;
      }
      resolve({ ok: true, text: Buffer.concat(chunks).toString("utf8") });
    });
    req.on("error", reject);
  });
}

async function handleGradeRequest(
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
  options: GraderServerOptions,
): Promise<void> {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

  if (!isAuthorized({ authorizationHeader: req.headers.authorization, expectedToken: options.token })) {
    sendJson(res, 401, apiError("UNAUTHORIZED", "Missing or invalid authorization"));
    return;
  }

  const bodyResult = await readRequestBody(req, maxBodyBytes);
  if (!bodyResult.ok) {
    sendJson(res, 413, apiError("PAYLOAD_TOO_LARGE", "Request body exceeds size limit"));
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyResult.text) as unknown;
  } catch {
    sendJson(res, 400, apiError("INVALID_JSON", "Request body must be valid JSON"));
    return;
  }

  if (!parsed || typeof parsed !== "object") {
    sendJson(res, 400, apiError("INVALID_REQUEST", "Request body must be a JSON object"));
    return;
  }

  const record = parsed as Record<string, unknown>;
  const caseIdRaw = record.caseId;
  if (typeof caseIdRaw !== "string" || caseIdRaw.trim().length === 0) {
    sendJson(res, 400, apiError("INVALID_REQUEST", "caseId is required"));
    return;
  }
  const caseId = caseIdRaw.trim().toLowerCase();

  if (record.proposal === undefined || record.proposal === null) {
    sendJson(res, 400, apiError("INVALID_REQUEST", "proposal is required"));
    return;
  }

  const proposalValidation = validateCanonicalStudyProposalV4(record.proposal);
  if (!proposalValidation.ok) {
    sendJson(res, 400, apiError("INVALID_PROPOSAL", "proposal failed contract validation"));
    return;
  }
  const proposal = proposalValidation.value;

  const goldenResult = resolveCertifiedGoldenByCaseId({
    evalRoot: options.evalRoot,
    caseId,
  });
  if (!goldenResult.ok) {
    if (goldenResult.error.code === "CASE_NOT_FOUND") {
      sendJson(res, 404, apiError("CASE_NOT_FOUND", "No certified golden for caseId"));
      return;
    }
    sendJson(res, 422, apiError("GOLDEN_NOT_CERTIFIED", "Golden exists but is not certified"));
    return;
  }
  const { golden } = goldenResult;

  try {
    const corpus = await loadGradeCorpusForGolden({
      repoRoot: options.repoRoot,
      goldenCaseId: golden.caseId,
      corpusDirRel: golden.corpusDir,
    });
    const grade = gradeGoldenProposal({ golden, proposal, corpus });
    sendJson(res, 200, grade);
  } catch (error) {
    if (error instanceof GoldenNotCertifiedError) {
      sendJson(res, 422, apiError("GOLDEN_NOT_CERTIFIED", "Golden is not certified"));
      return;
    }
    console.error("[eval-grader] grading failed", error);
    sendJson(res, 500, apiError("GRADING_FAILED", "Grading failed"));
  }
}

export function createGraderRequestListener(options: GraderServerOptions) {
  return (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse): void => {
    const path = req.url?.split("?")[0] ?? "";

    if (path === "/health") {
      if (req.method !== "GET" && req.method !== "HEAD") {
        sendJson(res, 405, apiError("METHOD_NOT_ALLOWED", "Method not allowed"));
        return;
      }
      if (req.method === "HEAD") {
        res.writeHead(200);
        res.end();
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    if (path === "/eval/grade") {
      if (req.method !== "POST") {
        sendJson(res, 405, apiError("METHOD_NOT_ALLOWED", "Method not allowed"));
        return;
      }
      void handleGradeRequest(req, res, options).catch((error: unknown) => {
        console.error("[eval-grader] unhandled request error", error);
        if (!res.headersSent) {
          sendJson(res, 500, apiError("GRADING_FAILED", "Internal error"));
        }
      });
      return;
    }

    sendJson(res, 404, apiError("NOT_FOUND", "Not found"));
  };
}

export function createGraderServer(options: GraderServerOptions): Server {
  return createServer(createGraderRequestListener(options));
}

export function listenGraderServer(
  server: Server,
  input: { host?: string; port?: number },
): Promise<{ host: string; port: number }> {
  const host = input.host ?? DEFAULT_HOST;
  const port = input.port ?? 0;
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unexpected server address"));
        return;
      }
      resolve({ host, port: address.port });
    });
  });
}

export function closeGraderServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export type { ApiErrorBody };
