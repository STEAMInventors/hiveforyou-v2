import { pushError, type PackValidationError } from "./errors.ts";
import { isRecord, pathJoin } from "./util.ts";

const NUMERIC_STRING_RE = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;

function stringParsesAsNumber(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === "") {
    return false;
  }
  return NUMERIC_STRING_RE.test(trimmed);
}

function isLegalNumberPath(path: string): boolean {
  if (path === "version") {
    return true;
  }
  return path.endsWith(".weight") || path === "weight";
}

/** S21: numbers only at root version and question weight paths. */
export function walkLegalNumbers(
  value: unknown,
  path: string,
  file: string,
  errors: PackValidationError[],
): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (!isLegalNumberPath(path)) {
      pushError(errors, file, path, "numbers are only allowed in version and weight");
    }
    return;
  }

  if (typeof value === "string") {
    const inRestrictedSubtree =
      path.includes(".window") ||
      path.endsWith(".window") ||
      path.includes(".threshold") ||
      path.endsWith(".threshold") ||
      path.includes(".when") ||
      path.endsWith(".when") ||
      path.includes(".requires") ||
      path.endsWith(".requires");
    if (inRestrictedSubtree && stringParsesAsNumber(value)) {
      pushError(
        errors,
        file,
        path,
        "numeric strings are not allowed in window, threshold, when, or requires",
      );
    }
    return;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      walkLegalNumbers(value[i], pathJoin(path, i), file, errors);
    }
    return;
  }

  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      walkLegalNumbers(child, pathJoin(path, key), file, errors);
    }
  }
}
