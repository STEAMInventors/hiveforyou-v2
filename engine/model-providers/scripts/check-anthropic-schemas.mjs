/**
 * Validates every JSON schema sent through CallModel against Anthropic structured-output limits.
 * See https://docs.anthropic.com/en/docs/build-with-claude/structured-outputs
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Anthropic from "@anthropic-ai/sdk";
import {
  ANTHROPIC_SCHEMA_MODE,
  assertAnthropicSchemaModeCoversMapTypedAdditionalProperties,
} from "../src/anthropic-schema-mode.ts";
import { extractFirstJsonObject } from "../src/extract-first-json-object.ts";
import { REGISTERED_ANTHROPIC_JSON_SCHEMAS } from "../src/registered-anthropic-json-schemas.ts";
import {
  findMapTypedAdditionalPropertiesPaths,
  getAdditionalPropertiesCoercionsForSchema,
  MapTypedAdditionalPropertiesError,
  sanitizeSchemaForAnthropic,
} from "../src/sanitize-schema-for-anthropic.ts";

const UNSUPPORTED_KEYWORDS = [
  "oneOf",
  "not",
  "if",
  "then",
  "else",
  "dependentRequired",
  "dependentSchemas",
  "patternProperties",
  "unevaluatedProperties",
  "unevaluatedItems",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "maxItems",
  "uniqueItems",
];

const SENSITIVE_NAME = /reasoning|thinking|rationale/i;
const PROMPT_MODE_SCHEMA_INSTRUCTION =
  "Return only one JSON object that matches this JSON Schema:";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");

function loadRepoDotEnv() {
  const envPath = join(repoRoot, ".env");
  let content;
  try {
    content = readFileSync(envPath, "utf8");
  } catch {
    return;
  }
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadRepoDotEnv();

const hiveAnthropicKey = process.env.HIVE_ANTHROPIC_API_KEY?.trim();
const hiveAnthropicWorkspaceId = process.env.HIVE_ANTHROPIC_WORKSPACE_ID?.trim();
console.log(
  `key loaded: ${hiveAnthropicKey ? "yes" : "no"}, workspace id loaded: ${hiveAnthropicWorkspaceId ? "yes" : "no"}`,
);

const SCHEMAS = REGISTERED_ANTHROPIC_JSON_SCHEMAS;

assertAnthropicSchemaModeCoversMapTypedAdditionalProperties();

function visit(node, visitFn, path = "root") {
  if (Array.isArray(node)) {
    for (const [index, child] of node.entries()) {
      visit(child, visitFn, `${path}[${index}]`);
    }
    return;
  }
  if (typeof node !== "object" || node === null) {
    return;
  }
  visitFn(node, path);
  for (const [key, child] of Object.entries(node)) {
    if (key === "description" || key === "enum" || key === "required") {
      continue;
    }
    visit(child, visitFn, `${path}.${key}`);
  }
}

function countUnionTypedParams(schema) {
  let count = 0;
  visit(schema, (node) => {
    if (!node.properties || typeof node.properties !== "object") {
      return;
    }
    for (const prop of Object.values(node.properties)) {
      if (typeof prop !== "object" || prop === null) {
        continue;
      }
      const hasUnion =
        Array.isArray(prop.anyOf) || (Array.isArray(prop.type) && prop.type.length > 1);
      if (hasUnion) {
        count += 1;
      }
    }
  });
  return count;
}

function countOptionalParams(schema) {
  let count = 0;
  visit(schema, (node) => {
    if (!node.properties || typeof node.properties !== "object") {
      return;
    }
    const required = new Set(Array.isArray(node.required) ? node.required : []);
    for (const key of Object.keys(node.properties)) {
      if (!required.has(key)) {
        count += 1;
      }
    }
  });
  return count;
}

function isObjectSchema(node) {
  return node.type === "object" || (Array.isArray(node.type) && node.type.includes("object"));
}

function findUnsupportedKeywords(schema) {
  const found = [];
  visit(schema, (node, path) => {
    for (const keyword of UNSUPPORTED_KEYWORDS) {
      if (Object.prototype.hasOwnProperty.call(node, keyword)) {
        found.push(`${path}.${keyword}`);
      }
    }
    if (
      Object.prototype.hasOwnProperty.call(node, "minItems") &&
      node.minItems !== 0 &&
      node.minItems !== 1
    ) {
      found.push(`${path}.minItems=${node.minItems}`);
    }
    if (
      Object.prototype.hasOwnProperty.call(node, "additionalProperties") &&
      node.additionalProperties !== false &&
      isObjectSchema(node)
    ) {
      found.push(`${path}.additionalProperties`);
    }
  });
  return found;
}

function findSensitivePropertyNames(schema) {
  const found = [];
  visit(schema, (node, path) => {
    if (!node.properties || typeof node.properties !== "object") {
      return;
    }
    for (const key of Object.keys(node.properties)) {
      if (SENSITIVE_NAME.test(key)) {
        found.push(`${path}.properties.${key}`);
      }
    }
  });
  return found;
}

function resolveMode(schemaName) {
  return ANTHROPIC_SCHEMA_MODE[schemaName] ?? "constrained";
}

function anthropicClient() {
  const apiKey = process.env.HIVE_ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  const workspaceId = process.env.HIVE_ANTHROPIC_WORKSPACE_ID?.trim();
  return new Anthropic({
    apiKey,
    ...(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {}),
  });
}

async function liveConstrainedCompileCheck(schemaName, schema) {
  if (process.env.SKIP_ANTHROPIC_LIVE === "1") {
    return "skipped";
  }
  const client = anthropicClient();
  if (!client) {
    return "skipped (no HIVE_ANTHROPIC_API_KEY)";
  }
  const model = process.env.MODEL_NAME?.trim() || "claude-opus-5-5";
  const sanitized = sanitizeSchemaForAnthropic(schema);
  try {
    await client.messages.create({
      model,
      max_tokens: 64,
      messages: [{ role: "user", content: `Compile check for ${schemaName}. Return {"ok":true}.` }],
      output_config: {
        format: {
          type: "json_schema",
          schema: sanitized,
        },
      },
    });
    return "ok";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function livePromptModeCheck(schemaName) {
  if (process.env.SKIP_ANTHROPIC_LIVE === "1") {
    return "skipped";
  }
  const client = anthropicClient();
  if (!client) {
    return "skipped (no HIVE_ANTHROPIC_API_KEY)";
  }
  const model = process.env.MODEL_NAME?.trim() || "claude-opus-5-5";
  const probeSchema = {
    type: "object",
    additionalProperties: false,
    properties: { probe: { type: "boolean" } },
    required: ["probe"],
  };
  const system = `${PROMPT_MODE_SCHEMA_INSTRUCTION}\n${JSON.stringify(probeSchema, null, 2)}`;
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 256,
      system,
      messages: [
        {
          role: "user",
          content: `Prompt-mode wire check for ${schemaName}. Reply with only: {"probe":true}`,
        },
      ],
    });
    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
    JSON.parse(extractFirstJsonObject(text));
    return "ok";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function pad(value, width) {
  const text = String(value);
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

const rows = [];
let failed = false;

console.log("\nadditionalProperties coercions (constrained schemas only):");
for (const entry of SCHEMAS) {
  const mode = resolveMode(entry.name);
  if (mode !== "constrained") {
    console.log(`  ${entry.name}: (prompt mode — no coercion)`);
    continue;
  }
  const mapPaths = findMapTypedAdditionalPropertiesPaths(entry.schema);
  if (mapPaths.length > 0) {
    console.error(
      `  ${entry.name}: map-typed additionalProperties at ${mapPaths.map((p) => p.path).join(", ")} — add prompt mode to ANTHROPIC_SCHEMA_MODE`,
    );
    failed = true;
    continue;
  }
  try {
    sanitizeSchemaForAnthropic(entry.schema);
  } catch (error) {
    if (error instanceof MapTypedAdditionalPropertiesError) {
      console.error(`  ${entry.name}: ${error.message}`);
      failed = true;
      continue;
    }
    throw error;
  }
  const coercions = getAdditionalPropertiesCoercionsForSchema(entry.schema);
  if (coercions.length === 0) {
    console.log(`  ${entry.name}: none (already additionalProperties: false everywhere)`);
  } else {
    for (const coercion of coercions) {
      console.log(`  ${entry.name}: ${coercion.path} ← ${coercion.before}`);
    }
  }
}
console.log("");

for (const entry of SCHEMAS) {
  const mode = resolveMode(entry.name);
  const unionCount = countUnionTypedParams(entry.schema);
  const optionalCount = countOptionalParams(entry.schema);
  let sanitized = entry.schema;
  if (mode === "constrained") {
    try {
      sanitized = sanitizeSchemaForAnthropic(entry.schema);
    } catch {
      sanitized = entry.schema;
    }
  }
  const unsupported =
    mode === "prompt" ? [] : findUnsupportedKeywords(sanitized);
  const sensitive = findSensitivePropertyNames(entry.schema);

  let unionLabel;
  let optionalLabel;
  if (mode === "prompt") {
    unionLabel =
      unionCount > 16 ? `prompt mode (unions ${unionCount} > 16)` : `prompt mode (unions ${unionCount})`;
    optionalLabel = optionalCount > 24 ? `prompt (opt ${optionalCount})` : String(optionalCount);
  } else {
    const unionOk = unionCount <= 16;
    const optionalOk = optionalCount <= 24;
    unionLabel = `${unionCount}${unionOk ? "" : " FAIL"}`;
    optionalLabel = `${optionalCount}${optionalOk ? "" : " FAIL"}`;
    if (!unionOk || !optionalOk) {
      failed = true;
    }
  }

  const unsupportedOk = unsupported.length === 0;
  const sensitiveOk = sensitive.length === 0;
  if (mode === "constrained" && (!unsupportedOk || !sensitiveOk)) {
    failed = true;
  }

  const live =
    mode === "prompt"
      ? await livePromptModeCheck(entry.name)
      : await liveConstrainedCompileCheck(entry.name, entry.schema);

  const liveLabel =
    mode === "prompt" && live === "ok"
      ? `prompt mode (unions ${unionCount}${unionCount > 16 ? " > 16" : ""}) ok`
      : live;

  if (live !== "ok" && !String(live).startsWith("skipped")) {
    failed = true;
  }

  rows.push({
    name: entry.name,
    mode,
    union: unionLabel,
    optional: optionalLabel,
    unsupported: unsupportedOk ? "none" : unsupported.join(", "),
    sensitive: sensitiveOk ? "none" : sensitive.join(", "),
    live: liveLabel,
  });
}

console.log(
  [
    pad("schema", 32),
    pad("mode", 12),
    pad("union≤16", 28),
    pad("opt≤24", 10),
    pad("unsupported", 24),
    pad("sensitive", 20),
    "live",
  ].join(" | "),
);
console.log("-".repeat(140));
for (const row of rows) {
  console.log(
    [
      pad(row.name, 32),
      pad(row.mode, 12),
      pad(row.union, 28),
      pad(row.optional, 10),
      pad(row.unsupported.slice(0, 22), 24),
      pad(row.sensitive.slice(0, 18), 20),
      row.live,
    ].join(" | "),
  );
}

if (failed) {
  console.error("\nAnthropic schema check failed.");
  process.exit(1);
}

console.log("\nAll Anthropic schema checks passed.");
