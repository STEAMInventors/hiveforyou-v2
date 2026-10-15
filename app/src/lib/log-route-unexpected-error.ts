const SAFE_ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,}$/;

export type RouteUnexpectedLogContext = {
  studyRunId?: string;
};

function parseLeadingErrorCode(message: string): string | undefined {
  const match = message.match(/^([A-Z][A-Z0-9_]{2,})(?::|\s)/);
  if (!match?.[1] || !SAFE_ERROR_CODE_PATTERN.test(match[1])) {
    return undefined;
  }
  return match[1];
}

export function resolveSafeErrorCode(error: unknown): string {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (typeof record.errorCode === "string" && SAFE_ERROR_CODE_PATTERN.test(record.errorCode)) {
      return record.errorCode;
    }
    if (typeof record.code === "string" && SAFE_ERROR_CODE_PATTERN.test(record.code)) {
      return record.code;
    }
  }

  if (error instanceof Error) {
    const fromMessage = parseLeadingErrorCode(error.message);
    if (fromMessage) {
      return fromMessage;
    }
    const errno = error as NodeJS.ErrnoException;
    if (typeof errno.code === "string" && /^E[A-Z0-9_]+$/.test(errno.code)) {
      return errno.code;
    }
    if (error.name !== "Error" && SAFE_ERROR_CODE_PATTERN.test(error.name)) {
      return error.name;
    }
  }

  return "UNKNOWN";
}

function redactSensitiveLogText(text: string): string {
  let out = text
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[a-zA-Z0-9_-]+\b/g, "sk-[REDACTED]")
    .replace(/eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "[REDACTED_JWT]");

  out = out.replace(/^(\s*(?:\w*Error):\s).+$/gm, (line, prefix: string) => {
    const messagePart = line.slice(prefix.length);
    if (messagePart.length > 80 || /["']/.test(messagePart)) {
      return `${prefix}[REDACTED_MESSAGE]`;
    }
    return line;
  });

  out = out
    .split("\n")
    .map((line) => {
      if (/["']/.test(line) && line.length > 48) {
        return "[REDACTED_STACK_LINE]";
      }
      return line;
    })
    .join("\n");

  return out
    .split("\n")
    .map((line) => (line.length > 512 ? `${line.slice(0, 512)}...` : line))
    .join("\n");
}

export function sanitizeStackTraceForLog(stack: string | undefined): string | undefined {
  if (!stack?.trim()) {
    return undefined;
  }
  const redacted = redactSensitiveLogText(stack.trim());
  const lines = redacted.split("\n").slice(0, 24);
  const joined = lines.join("\n");
  return joined.length > 8000 ? `${joined.slice(0, 8000)}...` : joined;
}

export function logRouteUnexpectedError(
  routeName: string,
  error: unknown,
  context: RouteUnexpectedLogContext = {},
): void {
  const exceptionClass = error instanceof Error ? error.name : "UnknownError";
  const safeErrorCode = resolveSafeErrorCode(error);
  const stack =
    error instanceof Error ? sanitizeStackTraceForLog(error.stack) : undefined;

  console.error(`[${routeName}] UNEXPECTED`, {
    route: routeName,
    exceptionClass,
    safeErrorCode,
    ...(context.studyRunId ? { studyRunId: context.studyRunId } : {}),
    ...(stack ? { stack } : {}),
  });
}
