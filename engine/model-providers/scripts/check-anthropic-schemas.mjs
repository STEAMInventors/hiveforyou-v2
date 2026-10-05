/**
 * Validates every JSON schema sent through CallModel against Anthropic structured-output limits.
 * See https://docs.anthropic.com/en/docs/build-with-claude/structured-outputs
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Anthropic from "@anthropic-ai/sdk";
import { CANONICAL_STUDY_PROPOSAL_V3_OPENAI_JSON_SCHEMA } from "../../shared/src/case-intelligence/3/openai-proposal-json-schema.ts";
import { CANONICAL_STUDY_PROPOSAL_V4_OPENAI_JSON_SCHEMA } from "../../shared/src/case-intelligence/4/openai-proposal-json-schema.ts";
import { HIVE_DISCOVER_PROPOSAL_JSON_SCHEMA } from "../../shared/src/discover/json-schema.ts";
import { HIVE_DISCOVER_PROPOSAL_V2_JSON_SCHEMA } from "../../shared/src/discover/json-schema-v2.ts";
import { HIVE_DISCOVER_RESOLUTION_JSON_SCHEMA } from "../../shared/src/discover/json-schema-resolution.ts";
import { CLIENT_SUMMARY_RESPONSE_JSON_SCHEMA } from "../../core/src/study/client-summary-pass.ts";
import { CLIENT_WRITER_RESPONSE_JSON_SCHEMA } from "../../core/src/study/client-writer-pass.ts";
import { STORY_WRITER_JSON_SCHEMA } from "../../core/src/study/story/generateStory.ts";

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

const SCHEMAS = [
  { name: "hive_discover_proposal_v1", schema: HIVE_DISCOVER_PROPOSAL_JSON_SCHEMA },
  { name: "hive_discover_proposal_v2", schema: HIVE_DISCOVER_PROPOSAL_V2_JSON_SCHEMA },
  { name: "hive_discover_resolution", schema: HIVE_DISCOVER_RESOLUTION_JSON_SCHEMA },
  { name: "canonical_study_proposal_v3", schema: CANONICAL_STUDY_PROPOSAL_V3_OPENAI_JSON_SCHEMA },
  { name: "canonical_study_proposal_v4", schema: CANONICAL_STUDY_PROPOSAL_V4_OPENAI_JSON_SCHEMA },
  { name: "story_writer_v1", schema: STORY_WRITER_JSON_SCHEMA },
  { name: "client_summary_v1", schema: CLIENT_SUMMARY_RESPONSE_JSON_SCHEMA },
  { name: "client_writer_v2", schema: CLIENT_WRITER_RESPONSE_JSON_SCHEMA },
];

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

async function liveCompileCheck(schemaName, schema) {
  if (process.env.SKIP_ANTHROPIC_LIVE === "1") {
    return "skipped";
  }
  const apiKey = process.env.HIVE_ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return "skipped (no HIVE_ANTHROPIC_API_KEY)";
  }
  const workspaceId = process.env.HIVE_ANTHROPIC_WORKSPACE_ID?.trim();
  const client = new Anthropic({
    apiKey,
    ...(workspaceId
      ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } }
      : {}),
  });
  const model = process.env.MODEL_NAME?.trim() || "claude-opus-5-5";
  try {
    await client.messages.create({
      model,
      max_tokens: 64,
      messages: [{ role: "user", content: `Compile check for ${schemaName}. Return {"ok":true}.` }],
      output_config: {
        format: {
          type: "json_schema",
          schema,
        },
      },
    });
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

for (const entry of SCHEMAS) {
  const unionCount = countUnionTypedParams(entry.schema);
  const optionalCount = countOptionalParams(entry.schema);
  const unsupported = findUnsupportedKeywords(entry.schema);
  const sensitive = findSensitivePropertyNames(entry.schema);

  const unionOk = unionCount <= 16;
  const optionalOk = optionalCount <= 24;
  const unsupportedOk = unsupported.length === 0;
  const sensitiveOk = sensitive.length === 0;

  if (!unionOk || !optionalOk || !unsupportedOk || !sensitiveOk) {
    failed = true;
  }

  const live = await liveCompileCheck(entry.name, entry.schema);
  if (live !== "ok" && !live.startsWith("skipped")) {
    failed = true;
  }

  rows.push({
    name: entry.name,
    union: `${unionCount}${unionOk ? "" : " FAIL"}`,
    optional: `${optionalCount}${optionalOk ? "" : " FAIL"}`,
    unsupported: unsupportedOk ? "none" : unsupported.join(", "),
    sensitive: sensitiveOk ? "none" : sensitive.join(", "),
    live,
  });
}

console.log(
  [
    pad("schema", 32),
    pad("union≤16", 10),
    pad("opt≤24", 10),
    pad("unsupported", 24),
    pad("sensitive", 20),
    "live compile",
  ].join(" | "),
);
console.log("-".repeat(120));
for (const row of rows) {
  console.log(
    [
      pad(row.name, 32),
      pad(row.union, 10),
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
