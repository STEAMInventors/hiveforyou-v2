import { pushError, type PackValidationError } from "./errors.ts";
import type { CoreDefaultsV2 } from "./types.ts";
import { validateBehaviorsBlock } from "./validate-behaviors.ts";
import { walkLegalNumbers } from "./validate-legal-numbers.ts";
import { isRecord } from "./util.ts";

export function validateCoreDefaultsDocument(
  doc: unknown,
  file: string,
): { ok: true; coreDefaults: CoreDefaultsV2 } | { ok: false; errors: PackValidationError[] } {
  const errors: PackValidationError[] = [];

  if (!isRecord(doc)) {
    pushError(errors, file, "", "document must be a mapping");
    return { ok: false, errors };
  }

  for (const key of Object.keys(doc)) {
    if (key !== "behaviors") {
      pushError(errors, file, key, "unknown top-level key");
    }
  }

  walkLegalNumbers(doc, "", file, errors);

  if (!("behaviors" in doc)) {
    pushError(errors, file, "behaviors", "missing required behaviors");
  }

  validateBehaviorsBlock(doc.behaviors, file, "behaviors", errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    coreDefaults: { behaviors: doc.behaviors as CoreDefaultsV2["behaviors"] },
  };
}
