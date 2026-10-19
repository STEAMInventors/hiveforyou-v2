import type { InterpretedTask } from "./study-intent";

export interface EphemeralSchemaRecord {
  id: string;
  originalPrompt: string;
  generatedSchema: Record<string, unknown>;
  interpretedTask: Record<string, unknown> | null;
  usageCount: number;
  createdAt: string;
}

export type EphemeralSchemaInsert = {
  originalPrompt: string;
  generatedSchema: Record<string, unknown>;
  interpretedTask: InterpretedTask | null;
};