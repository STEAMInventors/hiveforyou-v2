import type { EphemeralSchemaInsert } from "@hiveforyou/shared/intake/ephemeral-schema";
import type { InterpretedTask } from "@hiveforyou/shared/intake/study-intent";

import { identityTextSample, joinPageText } from "./sample";
import type {
  DocumentIdentityRecord,
  DocumentNormalizedExtractionRecord,
} from "./types";

export interface DynamicSchemaRequest {
  rawIntent: string;
  documentSamples: string[];
}

export interface DynamicSchemaResponse {
  schemaId: string;
  schemaDefinition: Record<string, unknown>;
  interpretedTask: InterpretedTask;
}

const RECEIPT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    merchant: { type: "string" },
    total: { type: "number" },
    junk_food_flag: { type: "boolean" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          merchant: { type: "string" },
          total: { type: "number" },
          junk_food_flag: { type: "boolean" },
        },
      },
    },
  },
};

const GENERIC_KEY_VALUE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    key: { type: "string" },
    value: { type: "string" },
  },
  additionalProperties: true,
};

function isGroceryOrJunkFoodIntent(rawIntent: string): boolean {
  const lower = rawIntent.toLowerCase();
  return lower.includes("junk food") || lower.includes("grocery");
}

export function collectDocumentSamples(
  identities: DocumentIdentityRecord[],
  normalizedBySourceId: Record<string, DocumentNormalizedExtractionRecord>,
): string[] {
  const samples: string[] = [];
  for (const identity of identities) {
    if (identity.analysisDisposition === "DISCARDED") {
      continue;
    }
    const normalized = normalizedBySourceId[identity.sourceDocumentId];
    if (!normalized) {
      continue;
    }
    const pageText = joinPageText(
      normalized.normalizedExtraction.pages.map((page) => ({ text: page.canonicalText })),
    );
    if (pageText.length === 0) {
      continue;
    }
    samples.push(identityTextSample(pageText));
  }
  return samples;
}

export async function generateEphemeralSchema(
  req: DynamicSchemaRequest,
  persistFn: (data: EphemeralSchemaInsert) => Promise<string>,
): Promise<DynamicSchemaResponse> {
  let schemaDefinition: Record<string, unknown>;
  let interpretedTask: InterpretedTask;

  if (isGroceryOrJunkFoodIntent(req.rawIntent)) {
    schemaDefinition = RECEIPT_SCHEMA;
    interpretedTask = {
      operation: "filter_and_sum",
      target_array: "items",
      filter_condition: "junk_food_flag == true",
    };
  } else {
    schemaDefinition = GENERIC_KEY_VALUE_SCHEMA;
    interpretedTask = {
      operation: "extract_key_values",
    };
  }

  const schemaId = await persistFn({
    originalPrompt: req.rawIntent,
    generatedSchema: schemaDefinition,
    interpretedTask,
  });

  return {
    schemaId,
    schemaDefinition,
    interpretedTask,
  };
}