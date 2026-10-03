import { RULEBOOK_AUDIT_SYSTEM_PROMPT } from "./rulebook-audit.prompt.ts";

export type RulebookModelClient = {
  completeJson: (userJson: unknown) => Promise<{ raw: string; parsed: unknown }>;
};

export function createRulebookModelClient(options?: {
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): RulebookModelClient {
  const baseUrl = options?.baseUrl ?? process.env.RULEBOOK_MODEL_BASE_URL ?? "http://127.0.0.1:8080/v1";
  const model = options?.model ?? process.env.RULEBOOK_MODEL_NAME ?? "local";
  const fetchImpl = options?.fetchImpl ?? fetch;

  return {
    async completeJson(userJson) {
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: RULEBOOK_AUDIT_SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify(userJson) },
          ],
        }),
      });
      if (!response.ok) {
        throw new Error(`model HTTP ${response.status}: ${await response.text()}`);
      }
      const body = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const raw = body.choices?.[0]?.message?.content ?? "";
      const parsed = JSON.parse(raw) as unknown;
      return { raw, parsed };
    },
  };
}
