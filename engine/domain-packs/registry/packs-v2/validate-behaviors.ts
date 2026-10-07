import { pushError, type PackValidationError } from "./errors";
import { BEHAVIOR_KEY_RE, isRecord, pathJoin } from "./util";

const BEHAVIOR_PROPERTY_KEYS = new Set([
  "unique",
  "stable",
  "time_indexed",
  "scope",
  "sensitive",
  "variants",
  "composed_of",
  "distinct_from",
  "normalize_to",
  "period_required",
  "comparable_on",
  "values",
  "note",
]);

const UNIQUE_VALUES = new Set(["one", "shared"]);

export function validateBehaviorsBlock(
  behaviors: unknown,
  file: string,
  pathPrefix: string,
  errors: PackValidationError[],
): void {
  if (!isRecord(behaviors)) {
    pushError(errors, file, pathPrefix, "behaviors must be a mapping");
    return;
  }

  for (const [key, props] of Object.entries(behaviors)) {
    const attrPath = pathJoin(pathPrefix, key);
    if (!BEHAVIOR_KEY_RE.test(key)) {
      pushError(errors, file, attrPath, "behavior key must be entity.attribute");
    }
    if (!isRecord(props)) {
      pushError(errors, file, attrPath, "behavior entry must be a mapping");
      continue;
    }
    for (const propKey of Object.keys(props)) {
      if (!BEHAVIOR_PROPERTY_KEYS.has(propKey)) {
        pushError(errors, file, pathJoin(attrPath, propKey), "unknown behavior property");
      }
    }
    const unique = props.unique;
    if (unique !== undefined && (typeof unique !== "string" || !UNIQUE_VALUES.has(unique))) {
      pushError(errors, file, pathJoin(attrPath, "unique"), "unique must be one or shared");
    }
  }
}
