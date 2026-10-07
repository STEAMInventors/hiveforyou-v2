import { pushError, type PackValidationError } from "./errors";
import type { LayersV2 } from "./types";
import { walkLegalNumbers } from "./validate-legal-numbers";
import { isRecord } from "./util";

const LAYERS_TOP_LEVEL = new Set(["pro_layer", "case_layer", "merge"]);

export function validateLayersDocument(
  doc: unknown,
  file: string,
): { ok: true; layers: LayersV2 } | { ok: false; errors: PackValidationError[] } {
  const errors: PackValidationError[] = [];

  if (!isRecord(doc)) {
    pushError(errors, file, "", "document must be a mapping");
    return { ok: false, errors };
  }

  for (const key of Object.keys(doc)) {
    if (!LAYERS_TOP_LEVEL.has(key)) {
      pushError(errors, file, key, "unknown top-level key");
    }
  }

  for (const required of ["pro_layer", "case_layer", "merge"] as const) {
    if (!(required in doc)) {
      pushError(errors, file, required, "missing required top-level key");
    } else if (!isRecord(doc[required])) {
      pushError(errors, file, required, "must be a mapping");
    }
  }

  walkLegalNumbers(doc, "", file, errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    layers: {
      pro_layer: doc.pro_layer as Record<string, unknown>,
      case_layer: doc.case_layer as Record<string, unknown>,
      merge: doc.merge as Record<string, unknown>,
    },
  };
}
