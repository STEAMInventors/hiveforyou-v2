import { createServer, type Server } from "node:http";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { WorkerEnv } from "../env.js";
import { DocumentPagesStorage } from "../intake/document-pages-storage.js";
import { WorkerSourceDocumentRepository } from "../intake/worker-source-documents.js";
import { bindDocumentPagesToSourceDocumentId } from "../study/trusted-document-pages-shared.js";
import { createSupabaseHiveGateway } from "../persistence/hive-gateway.js";

import { isAuthorized } from "./auth.js";
import {
  verifyReaderFact,
  type ReaderFactVerifyInput,
  type ReaderVerifierDeps,
  type ReaderVerifierScope,
} from "./verify-reader-fact.js";
import {
  createSupabaseAgentRunTraceIngestDeps,
  handleAgentRunTraceIngestRequest,
  readAgentTraceEnv,
  type AgentRunTraceIngestDeps,
} from "../trace/agent-run-trace-ingest.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;

export type VerifierServerOptions = {
  token: string;
  deps: ReaderVerifierDeps;
  traceIngest?: {
    token: string;
    deps: AgentRunTraceIngestDeps;
  };
  host?: string;
  port?: number;
  maxBodyBytes?: number;
};

type ApiErrorBody = { error: { code: string; message: string } };

function apiError(code: string, message: string): ApiErrorBody {
  return { error: { code, message } };
}

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

function parseVerifyInput(parsed: unknown): ReaderFactVerifyInput | null {
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  const caseId = record.caseId;
  const userId = record.userId;
  if (typeof caseId !== "string" || typeof userId !== "string") {
    return null;
  }
  const evidenceRaw = record.evidence;
  if (!Array.isArray(evidenceRaw) || evidenceRaw.length === 0) {
    return null;
  }
  const evidence: ReaderFactVerifyInput["evidence"] = [];
  for (const item of evidenceRaw) {
    if (!item || typeof item !== "object") {
      return null;
    }
    const ev = item as Record<string, unknown>;
    if (typeof ev.sourceDocumentId !== "string" || typeof ev.quote !== "string") {
      return null;
    }
    const page = ev.page;
    if (typeof page !== "number" || !Number.isInteger(page) || page < 1) {
      return null;
    }
    evidence.push({
      sourceDocumentId: ev.sourceDocumentId,
      page,
      quote: ev.quote,
      spanStart: typeof ev.spanStart === "number" ? ev.spanStart : undefined,
      spanEnd: typeof ev.spanEnd === "number" ? ev.spanEnd : undefined,
    });
  }
  return {
    caseId: caseId.trim(),
    userId: userId.trim(),
    verificationStatus:
      typeof record.verificationStatus === "string" ? record.verificationStatus : undefined,
    evidence,
  };
}

async function handleVerifyReaderFact(
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
  options: VerifierServerOptions,
): Promise<void> {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

  if (
    !isAuthorized({
      authorizationHeader: req.headers.authorization,
      expectedToken: options.token,
    })
  ) {
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

  const input = parseVerifyInput(parsed);
  if (!input) {
    sendJson(res, 400, apiError("INVALID_REQUEST", "Invalid reader fact verify request"));
    return;
  }

  const result = await verifyReaderFact(input, options.deps);
  sendJson(res, 200, result);
}

export function createVerifierRequestListener(options: VerifierServerOptions) {
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

    if (path === "/verifier/reader-fact") {
      if (req.method !== "POST") {
        sendJson(res, 405, apiError("METHOD_NOT_ALLOWED", "Method not allowed"));
        return;
      }
      void handleVerifyReaderFact(req, res, options).catch((error: unknown) => {
        console.error("[reader-verifier] unhandled request error", error);
        if (!res.headersSent) {
          sendJson(res, 500, apiError("VERIFY_FAILED", "Internal error"));
        }
      });
      return;
    }


    if (path === "/internal/agent-run-trace/events") {
      if (req.method !== "POST") {
        sendJson(res, 405, apiError("METHOD_NOT_ALLOWED", "Method not allowed"));
        return;
      }
      if (!options.traceIngest) {
        sendJson(res, 503, apiError("TRACE_INGEST_UNAVAILABLE", "Trace ingest is not configured"));
        return;
      }
      void handleAgentRunTraceIngestRequest(
        req,
        res,
        {
          token: options.traceIngest.token,
          deps: options.traceIngest.deps,
          maxBodyBytes: options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
        },
        readRequestBody,
      ).catch((error: unknown) => {
        console.error("[agent-run-trace] unhandled request error", error);
        if (!res.headersSent) {
          sendJson(res, 500, apiError("TRACE_INGEST_FAILED", "Internal error"));
        }
      });
      return;
    }
    sendJson(res, 404, apiError("NOT_FOUND", "Not found"));
  };
}

export function createVerifierServer(options: VerifierServerOptions): Server {
  return createServer(createVerifierRequestListener(options));
}

export function listenVerifierServer(
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

export function closeVerifierServer(server: Server): Promise<void> {
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

export function createSupabaseReaderVerifierDeps(
  supabase: SupabaseClient,
  env: WorkerEnv,
): ReaderVerifierDeps {
  const gateway = createSupabaseHiveGateway(supabase);
  const bucket = env.HIVE_DOCUMENT_PAGES_BUCKET?.trim() || "document-pages";
  const pagesStorage = new DocumentPagesStorage(gateway, bucket);

  return {
    async resolveScope(caseId, userId) {
      const repo = new WorkerSourceDocumentRepository(gateway, userId);
      const docs = await repo.listByCase(userId, caseId);
      if (!docs.length) {
        return null;
      }
      const scope: ReaderVerifierScope = {
        caseId,
        userId,
        domainId: "iep",
        authorizedSourceDocumentIds: docs.map((d) => d.id),
      };
      return scope;
    },
    async loadDocumentPages(userId, sourceDocumentId) {
      const repo = new WorkerSourceDocumentRepository(gateway, userId);
      const record = await repo.getById(userId, sourceDocumentId);
      if (!record) {
        return null;
      }
      const cached = await pagesStorage.load(userId, record.sha256);
      if (!cached) {
        return null;
      }
      return bindDocumentPagesToSourceDocumentId(cached, sourceDocumentId);
    },
  };
}

export function readVerifierEnv(
  source: Record<string, string | undefined> = process.env,
): { token: string; port: number } | null {
  const token = source.HIVE_VERIFIER_TOKEN?.trim();
  if (!token) {
    return null;
  }
  const portRaw = source.HIVE_VERIFIER_PORT?.trim();
  const port = portRaw ? Number(portRaw) : 4319;
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("HIVE_VERIFIER_PORT_INVALID");
  }
  return { token, port };
}

export async function startVerifierServerIfConfigured(
  supabase: SupabaseClient,
  env: WorkerEnv,
): Promise<Server | null> {
  const verifierEnv = readVerifierEnv();
  if (!verifierEnv) {
    return null;
  }
  const deps = createSupabaseReaderVerifierDeps(supabase, env);
  const traceEnv = readAgentTraceEnv();
  const server = createVerifierServer({
    token: verifierEnv.token,
    deps,
    ...(traceEnv
      ? {
          traceIngest: {
            token: traceEnv.token,
            deps: createSupabaseAgentRunTraceIngestDeps(supabase),
          },
        }
      : {}),
    port: verifierEnv.port,
    host: DEFAULT_HOST,
  });
  await listenVerifierServer(server, { host: DEFAULT_HOST, port: verifierEnv.port });
  console.info("[reader-verifier] listening", {
    host: DEFAULT_HOST,
    port: verifierEnv.port,
    path: "/verifier/reader-fact",
    traceIngest: traceEnv ? "/internal/agent-run-trace/events" : null,
  });
  return server;
}
