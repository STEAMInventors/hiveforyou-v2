import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseHiveGateway } from "../persistence/hive-gateway.js";
import {
  AgentRunTraceConflictError,
  AgentRunTracePersistenceError,
  AgentRunTraceRepository,
  AgentRunTraceValidationError,
  validateAgentRunTraceEvent,
  type AgentRunTraceAppendResult,
  type AgentRunTraceEventInput,
} from "../persistence/agent-run-trace.js";
import { isAuthorized } from "../verifier/auth.js";

/** Must stay aligned with hive_agents.trace_emitter (Python Reader flush). */
export const AGENT_RUN_TRACE_MAX_EVENTS_PER_BATCH = 256;
export const AGENT_RUN_TRACE_MAX_BODY_BYTES = 2 * 1024 * 1024;

export type AgentRunTraceIngestDeps = {
  repository: AgentRunTraceRepository;
};

export type AgentRunTraceIngestResult = {
  results: Array<{ id: string; outcome: AgentRunTraceAppendResult }>;
};

type ApiErrorBody = { error: { code: string; message: string } };

function apiError(code: string, message: string): ApiErrorBody {
  return { error: { code, message } };
}

export function createSupabaseAgentRunTraceIngestDeps(
  supabase: SupabaseClient,
): AgentRunTraceIngestDeps {
  const gateway = createSupabaseHiveGateway(supabase);
  return {
    repository: new AgentRunTraceRepository(gateway),
  };
}

export async function ingestAgentRunTraceEvents(
  parsed: unknown,
  deps: AgentRunTraceIngestDeps,
): Promise<AgentRunTraceIngestResult> {
  if (!parsed || typeof parsed !== "object") {
    throw new AgentRunTraceValidationError("Body must be an object.", "INVALID_REQUEST");
  }
  const eventsRaw = (parsed as Record<string, unknown>).events;
  if (!Array.isArray(eventsRaw) || eventsRaw.length === 0) {
    throw new AgentRunTraceValidationError("events must be a non-empty array.", "INVALID_REQUEST");
  }
  if (eventsRaw.length > AGENT_RUN_TRACE_MAX_EVENTS_PER_BATCH) {
    throw new AgentRunTraceValidationError("Too many events in one batch.", "PAYLOAD_TOO_LARGE");
  }

  const validated: AgentRunTraceEventInput[] = eventsRaw.map((item) =>
    validateAgentRunTraceEvent(item),
  );

  const attemptIds = new Set(validated.map((event) => event.attemptId));
  if (attemptIds.size !== 1) {
    throw new AgentRunTraceValidationError(
      "All events in a batch must share the same attemptId.",
      "ATTEMPT_MISMATCH",
    );
  }
  const studyRunIds = new Set(validated.map((event) => event.studyRunId));
  if (studyRunIds.size !== 1) {
    throw new AgentRunTraceValidationError(
      "All events in a batch must share the same studyRunId.",
      "STUDY_RUN_MISMATCH",
    );
  }

  const results: AgentRunTraceIngestResult["results"] = [];
  for (const event of validated) {
    const outcome = await deps.repository.appendWithScopeValidation(event);
    results.push({ id: event.id, outcome });
  }
  return { results };
}

export async function handleAgentRunTraceIngestRequest(
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
  options: { token: string; deps: AgentRunTraceIngestDeps; maxBodyBytes: number },
  readBody: (
    req: import("node:http").IncomingMessage,
    maxBytes: number,
  ) => Promise<{ ok: true; text: string } | { ok: false; code: "PAYLOAD_TOO_LARGE" }>,
): Promise<void> {
  if (
    !isAuthorized({
      authorizationHeader: req.headers.authorization,
      expectedToken: options.token,
    })
  ) {
    res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(apiError("UNAUTHORIZED", "Missing or invalid authorization")));
    return;
  }

  const bodyResult = await readBody(req, options.maxBodyBytes);
  if (!bodyResult.ok) {
    res.writeHead(413, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(apiError("PAYLOAD_TOO_LARGE", "Request body exceeds size limit")));
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyResult.text) as unknown;
  } catch {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(apiError("INVALID_JSON", "Request body must be valid JSON")));
    return;
  }

  try {
    const result = await ingestAgentRunTraceEvents(parsed, options.deps);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(result));
  } catch (error) {
    if (error instanceof AgentRunTraceValidationError) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(apiError(error.code, error.message)));
      return;
    }
    if (error instanceof AgentRunTraceConflictError) {
      res.writeHead(409, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(apiError(error.code, error.message)));
      return;
    }
    if (error instanceof AgentRunTracePersistenceError) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(apiError("TRACE_PERSIST_FAILED", error.message)));
      return;
    }
    console.error("[agent-run-trace] unhandled ingest error", error);
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(apiError("TRACE_INGEST_FAILED", "Internal error")));
  }
}

export function readAgentTraceEnv(
  source: Record<string, string | undefined> = process.env,
): { token: string } | null {
  const token =
    source.HIVE_AGENT_TRACE_TOKEN?.trim() || source.HIVE_VERIFIER_TOKEN?.trim() || "";
  if (!token) {
    return null;
  }
  return { token };
}
