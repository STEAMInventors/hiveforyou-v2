import { NextResponse } from "next/server";

import {
  createOrReuseCase,
  persistSourceDocument,
  UnauthenticatedError,
} from "@hiveforyou/core";

import { readServerEnv, readServerEnvPresence } from "@/lib/env/server-env";
import { createSupabaseHiveGateway } from "@/lib/persistence/hive-gateway";
import {
  SupabaseCaseRepository,
  SupabaseSourceDocumentRepository,
  SupabaseSourceDocumentStorage,
} from "@/lib/persistence/supabase-repositories";
import { mapWithConcurrency } from "@hiveforyou/intake";
import { createServerSupabaseClient, getAuthenticatedUserId } from "@/lib/supabase/server";

/** Parallel Supabase uploads; cap concurrency to limit memory spikes on large batches. */
const COMMIT_UPLOAD_CONCURRENCY = 3;

const SUPABASE_ERROR_KEYS = ["code", "message", "details", "hint"] as const;

function readSupabaseErrorFields(value: unknown): Record<string, string> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const fields: Record<string, string> = {};
  for (const key of SUPABASE_ERROR_KEYS) {
    const field = record[key];
    if (typeof field === "string" && field.length > 0) {
      fields[key] = field;
    }
  }
  return Object.keys(fields).length > 0 ? fields : null;
}

/** Server-only diagnostics for local dev; never included in API responses. */
function logDocumentCommitFailure(error: unknown): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  const supabaseFromError = readSupabaseErrorFields(error);
  if (error instanceof Error) {
    const payload: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    };
    if (error.stack) {
      payload.stack = error.stack;
    }
    const supabaseFromCause = readSupabaseErrorFields(error.cause);
    if (supabaseFromCause) {
      payload.supabase = supabaseFromCause;
    } else if (supabaseFromError) {
      payload.supabase = supabaseFromError;
    }
    console.error("[api/documents/commit] document persistence failed", payload);
    return;
  }

  if (supabaseFromError) {
    console.error("[api/documents/commit] document persistence failed", {
      supabase: supabaseFromError,
    });
    return;
  }

  console.error("[api/documents/commit] document persistence failed", error);
}

function logDocumentCommitEntry(): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }
  console.error("[api/documents/commit] POST entered");
}

function logDocumentCommitNonSuccess(status: number, errorCode: string): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }
  console.error("[api/documents/commit] non-success return", { status, error: errorCode });
}

/** Development-only. Logs which required configuration checks are satisfied, never their values. */
function logServerMisconfiguredPresence(check: "readServerEnv" | "getAuthenticatedUserId"): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }
  console.error(`[api/documents/commit] SERVER_MISCONFIGURED (${check})`, readServerEnvPresence());
}

function logDocumentCommitUncaught(error: unknown): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  const supabaseFromError = readSupabaseErrorFields(error);
  if (error instanceof Error) {
    const payload: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    };
    if (error.stack) {
      payload.stack = error.stack;
    }
    if (error.cause !== undefined) {
      if (error.cause instanceof Error) {
        payload.cause = { name: error.cause.name, message: error.cause.message };
      } else {
        const supabaseFromCause = readSupabaseErrorFields(error.cause);
        if (supabaseFromCause) {
          payload.cause = { supabase: supabaseFromCause };
        }
      }
    }
    const supabaseFromCause = readSupabaseErrorFields(error.cause);
    if (supabaseFromCause) {
      payload.supabase = supabaseFromCause;
    } else if (supabaseFromError) {
      payload.supabase = supabaseFromError;
    }
    console.error("[api/documents/commit] uncaught exception", payload);
    return;
  }

  if (supabaseFromError) {
    console.error("[api/documents/commit] uncaught exception", { supabase: supabaseFromError });
    return;
  }

  console.error("[api/documents/commit] uncaught exception", { message: String(error) });
}

export async function POST(request: Request) {
  logDocumentCommitEntry();
  try {
    let env;
    try {
      env = readServerEnv();
    } catch {
      logDocumentCommitNonSuccess(500, "SERVER_MISCONFIGURED");
      logServerMisconfiguredPresence("readServerEnv");
      return NextResponse.json(
        { error: "SERVER_MISCONFIGURED", message: "Server environment is incomplete." },
        { status: 500 },
      );
    }

    let sessionUserId: string | null;
    try {
      sessionUserId = await getAuthenticatedUserId();
    } catch {
      logDocumentCommitNonSuccess(500, "SERVER_MISCONFIGURED");
      logServerMisconfiguredPresence("getAuthenticatedUserId");
      return NextResponse.json(
        { error: "SERVER_MISCONFIGURED", message: "Server environment is incomplete." },
        { status: 500 },
      );
    }
    if (!sessionUserId) {
      logDocumentCommitNonSuccess(401, "UNAUTHENTICATED");
      return NextResponse.json(
        { error: "UNAUTHENTICATED", message: "Sign in is required." },
        { status: 401 },
      );
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      logDocumentCommitNonSuccess(400, "INVALID_BODY");
      return NextResponse.json(
        { error: "INVALID_BODY", message: "Invalid document upload." },
        { status: 400 },
      );
    }

    const requestedCaseId = String(form.get("caseId") ?? "");
    const files = form.getAll("file");
    const stagedIds = form.getAll("stagedDocumentId").map((value) => String(value));
    if (!files.length || files.length !== stagedIds.length) {
      logDocumentCommitNonSuccess(400, "INVALID_BODY");
      return NextResponse.json(
        { error: "INVALID_BODY", message: "Each file needs a staged document id." },
        { status: 400 },
      );
    }

    try {
      const gateway = createSupabaseHiveGateway(await createServerSupabaseClient());
      const cases = new SupabaseCaseRepository(gateway, sessionUserId);
      const caseRecord = await createOrReuseCase(cases, {
        sessionUserId,
        requestedCaseId,
      });
      const documents = new SupabaseSourceDocumentRepository(gateway, sessionUserId);
      const storage = new SupabaseSourceDocumentStorage(
        gateway,
        env.HIVE_STORAGE_BUCKET,
        sessionUserId,
      );

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const stagedDocumentId = stagedIds[index];
        if (!(file instanceof File) || !stagedDocumentId) {
          logDocumentCommitNonSuccess(400, "INVALID_BODY");
          return NextResponse.json(
            { error: "INVALID_BODY", message: "Invalid document upload." },
            { status: 400 },
          );
        }
      }

      const saved = await mapWithConcurrency(
        files,
        COMMIT_UPLOAD_CONCURRENCY,
        async (file, index) => {
          const stagedDocumentId = stagedIds[index]!;
          const record = await persistSourceDocument(
            {
              storage,
              documents,
              bucket: env.HIVE_STORAGE_BUCKET,
            },
            {
              userId: sessionUserId,
              caseId: caseRecord.id,
              originalFilename: (file as File).name,
              mimeType: (file as File).type || undefined,
              bytes: new Uint8Array(await (file as File).arrayBuffer()),
              clientStagedId: stagedDocumentId,
            },
          );
          return {
            stagedDocumentId,
            sourceDocumentId: record.id,
          };
        },
      );

      return NextResponse.json({
        caseId: caseRecord.id,
        documents: saved,
      });
    } catch (error) {
      if (error instanceof UnauthenticatedError) {
        logDocumentCommitNonSuccess(401, "UNAUTHENTICATED");
        return NextResponse.json(
          { error: "UNAUTHENTICATED", message: "Sign in is required." },
          { status: 401 },
        );
      }
      logDocumentCommitFailure(error);
      logDocumentCommitNonSuccess(500, "DOCUMENT_PERSISTENCE_FAILED");
      return NextResponse.json(
        {
          error: "DOCUMENT_PERSISTENCE_FAILED",
          message: "Documents were not stored.",
        },
        { status: 500 },
      );
    }
  } catch (error) {
    logDocumentCommitUncaught(error);
    throw error;
  }
}
