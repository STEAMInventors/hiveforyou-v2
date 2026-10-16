/**
 * Export hive-writer Anthropic structured-output contract for hive-agents (single source: TS schema).
 * Does not call models.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const schemaModule = join(
  repoRoot,
  "engine/core/src/projections/hive-writer/hive-writer-response-json-schema.ts",
);
const sanitizeModule = join(repoRoot, "engine/model-providers/src/sanitize-schema-for-anthropic.ts");

const { HIVE_WRITER_RESPONSE_JSON_SCHEMA } = await import(pathToFileURL(schemaModule).href);
const {
  findMapTypedAdditionalPropertiesPaths,
  MapTypedAdditionalPropertiesError,
  sanitizeSchemaForAnthropic,
} = await import(pathToFileURL(sanitizeModule).href);

const SCHEMA_NAME = "hive_writer_proposal_v1";
const OUT_PATH = join(
  repoRoot,
  "agents/src/hive_agents/contracts/hive-writer-anthropic-response-format.json",
);

const mapPaths = findMapTypedAdditionalPropertiesPaths(HIVE_WRITER_RESPONSE_JSON_SCHEMA);
let anthropicConstrainedSupported = true;
let unsupportedReason = null;
let sanitizedSchema = null;

try {
  sanitizedSchema = sanitizeSchemaForAnthropic(HIVE_WRITER_RESPONSE_JSON_SCHEMA);
} catch (error) {
  if (error instanceof MapTypedAdditionalPropertiesError) {
    anthropicConstrainedSupported = false;
    unsupportedReason = "MAP_TYPED_ADDITIONAL_PROPERTIES";
  } else {
    throw error;
  }
}

const schemaSha256 = createHash("sha256")
  .update(JSON.stringify(HIVE_WRITER_RESPONSE_JSON_SCHEMA))
  .digest("hex");

const payload = {
  schemaVersion: "hive-writer-anthropic-contract/1",
  schemaName: SCHEMA_NAME,
  proposalSchemaVersion: "hive-writer-proposal/1",
  sourceModule: "engine/core/src/projections/hive-writer/hive-writer-response-json-schema.ts",
  schemaSha256,
  anthropicConstrainedSupported,
  unsupportedReason,
  mapTypedAdditionalPropertiesPaths: mapPaths.map((entry) => entry.path),
  responseFormat:
    anthropicConstrainedSupported && sanitizedSchema
      ? {
          type: "json_schema",
          json_schema: {
            name: SCHEMA_NAME,
            strict: true,
            schema: sanitizedSchema,
          },
        }
      : null,
};

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Wrote ${OUT_PATH} (anthropicConstrainedSupported=${anthropicConstrainedSupported})`);
