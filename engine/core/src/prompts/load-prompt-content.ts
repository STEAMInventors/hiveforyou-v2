import { PROMPTS, type PromptKey } from "./generated-prompts";

export function normalizePromptText(raw: string): string {
  return raw.replace(/\r\n/g, "\n");
}

export function hasBundledPrompt(relativePath: string): relativePath is PromptKey {
  return Object.prototype.hasOwnProperty.call(PROMPTS, relativePath);
}

export function loadBundledPromptContent(relativePath: string): string {
  if (!hasBundledPrompt(relativePath)) {
    return "";
  }
  return normalizePromptText(PROMPTS[relativePath]);
}
