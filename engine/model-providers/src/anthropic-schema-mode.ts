import { findMapTypedAdditionalPropertiesPaths } from "./sanitize-schema-for-anthropic";
import { REGISTERED_ANTHROPIC_JSON_SCHEMAS } from "./registered-anthropic-json-schemas";

/** Explicit Anthropic structured-output mode per CallModel json_schema name (no auto-detection). */
export type AnthropicSchemaMode = "constrained" | "prompt";

// prompt: unions exceed Anthropic's documented limit of 16 (v3: 40, v4: 85)
// hive_discover_proposal_v2: discover/2 proposal exceeds Anthropic compiled-grammar size in constrained mode
// Map-typed additionalProperties (object-valued additionalProperties; cannot coerce to false):
// — add schema name here with comment listing paths from findMapTypedAdditionalPropertiesPaths when discovered
export const ANTHROPIC_SCHEMA_MODE: Record<string, AnthropicSchemaMode> = {
  canonical_study_proposal_v3: "prompt",
  canonical_study_proposal_v4: "prompt",
  hive_discover_proposal_v2: "prompt",
};

/** Ensures every registered schema with map-typed additionalProperties is in prompt mode. */
export function assertAnthropicSchemaModeCoversMapTypedAdditionalProperties(): void {
  for (const entry of REGISTERED_ANTHROPIC_JSON_SCHEMAS) {
    const mapPaths = findMapTypedAdditionalPropertiesPaths(entry.schema);
    if (mapPaths.length === 0) {
      continue;
    }
    if (resolveAnthropicSchemaMode(entry.name) !== "prompt") {
      const pathList = mapPaths.map((p) => p.path).join(", ");
      throw new Error(
        `${entry.name} has map-typed additionalProperties at ${pathList}; add prompt mode to ANTHROPIC_SCHEMA_MODE with reason.`,
      );
    }
  }
}

export function resolveAnthropicSchemaMode(schemaName: string): AnthropicSchemaMode {
  return ANTHROPIC_SCHEMA_MODE[schemaName] ?? "constrained";
}
