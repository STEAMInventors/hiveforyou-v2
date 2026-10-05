/** Explicit Anthropic structured-output mode per CallModel json_schema name (no auto-detection). */
export type AnthropicSchemaMode = "constrained" | "prompt";

// prompt: unions exceed Anthropic's documented limit of 16 (v3: 40, v4: 85)
// hive_discover_proposal_v2: discover/2 proposal exceeds Anthropic compiled-grammar size in constrained mode
export const ANTHROPIC_SCHEMA_MODE: Record<string, AnthropicSchemaMode> = {
  canonical_study_proposal_v3: "prompt",
  canonical_study_proposal_v4: "prompt",
  hive_discover_proposal_v2: "prompt",
};

export function resolveAnthropicSchemaMode(schemaName: string): AnthropicSchemaMode {
  return ANTHROPIC_SCHEMA_MODE[schemaName] ?? "constrained";
}
