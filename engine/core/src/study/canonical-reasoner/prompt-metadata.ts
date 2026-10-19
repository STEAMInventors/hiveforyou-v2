import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const CANONICAL_REASONER_PROMPT_ID = "canonical-reasoner" as const;
export const CANONICAL_REASONER_PROMPT_VERSION = "1.0.0" as const;

const moduleDir = dirname(fileURLToPath(import.meta.url));

export function resolveCanonicalReasonerPromptPath(): string {
  return join(moduleDir, "../../../prompts/canonical-reasoner/canonical-reasoner-v1.md");
}

export function loadCanonicalReasonerSystemPrompt(): string {
  return readFileSync(resolveCanonicalReasonerPromptPath(), "utf8");
}

export function canonicalReasonerPromptSha256(promptText?: string): string {
  const text = promptText ?? loadCanonicalReasonerSystemPrompt();
  return createHash("sha256").update(text, "utf8").digest("hex");
}
