import { randomUUID } from "node:crypto";

import type { EphemeralSchemaInsert } from "@hiveforyou/shared/intake/ephemeral-schema";

import type { HiveGateway } from "./hive-gateway";

export async function insertEphemeralSchema(
  gateway: HiveGateway,
  row: EphemeralSchemaInsert,
): Promise<string> {
  const id = randomUUID();
  await gateway.insert("ephemeral_schemas", {
    id,
    original_prompt: row.originalPrompt,
    generated_schema: row.generatedSchema,
    interpreted_task: row.interpretedTask,
  });
  return id;
}