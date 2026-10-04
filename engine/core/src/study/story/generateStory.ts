import type { DomainPack } from "@hiveforyou/domain-pack";
import type { Study } from "@hiveforyou/shared/pack-study";
import type { ValidatedStoryResult } from "@hiveforyou/shared/projections";

import {
  defaultOpenAICreateResponse,
  extractOpenAIResponseOutputText,
} from "../../discover/openai-engine";
import { buildSkeleton } from "./buildSkeleton";
import { STORY_WRITER_SYSTEM_PROMPT } from "./storyPrompt";
import {
  chapterFactIds,
  fallbackFromSkeleton,
  sanitizeStoryModelOutput,
  validateStory,
} from "./validateStory";
import type { StorySkeleton } from "./types";

/** Default when `HIVE_STORY_WRITER_MODEL` is unset — lighter model than canonical study. */
export const DEFAULT_STORY_WRITER_MODEL = "gpt-4o-mini";

export type GenerateStoryInput = {
  pack: DomainPack;
  study: Study;
  intent: string;
  apiKey?: string;
  model?: string;
  fixtureProse?: ValidatedStoryResult;
};

function skeletonForModelPrompt(skeleton: StorySkeleton): unknown {
  return {
    ...skeleton,
    allowedFactIds: Object.keys(skeleton.facts),
    chapterFactIds: skeleton.chapters.map((chapter) => ({
      chapter: chapter.chapter,
      factIds: [...chapterFactIds(chapter)],
    })),
  };
}

async function callStoryModel(
  skeleton: StorySkeleton,
  input: GenerateStoryInput,
  retryErrors?: string[],
): Promise<unknown> {
  if (input.fixtureProse?.kind === "prose") {
    return { paragraphs: input.fixtureProse.story.paragraphs };
  }

  const skeletonPayload = skeletonForModelPrompt(skeleton);
  const userText =
    retryErrors?.length ?
      `${JSON.stringify(skeletonPayload)}\n\nYour previous answer failed these checks: ${retryErrors.join("; ")}. Fix them and return JSON only.`
    : JSON.stringify(skeletonPayload);

  const body = {
    model: input.model ?? DEFAULT_STORY_WRITER_MODEL,
    temperature: 0,
    input: [
      { role: "system", content: [{ type: "input_text", text: STORY_WRITER_SYSTEM_PROMPT }] },
      { role: "user", content: [{ type: "input_text", text: userText }] },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "story_writer_v1",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            paragraphs: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  chapter: { type: "string" },
                  sentences: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        text: { type: "string" },
                        factIds: { type: "array", items: { type: "string" } },
                      },
                      required: ["text", "factIds"],
                    },
                  },
                },
                required: ["chapter", "sentences"],
              },
            },
          },
          required: ["paragraphs"],
        },
      },
    },
  };

  if (!input.apiKey?.trim()) {
    throw new Error("STORY_MODEL_NO_API_KEY");
  }
  const responsePayload = await defaultOpenAICreateResponse({
    apiKey: input.apiKey,
    model: input.model ?? DEFAULT_STORY_WRITER_MODEL,
    reasoningEffort: "low",
    body,
  });
  const text = extractOpenAIResponseOutputText(responsePayload);
  if (!text) {
    throw new Error("STORY_MODEL_EMPTY");
  }
  return JSON.parse(text) as unknown;
}

function logStoryModelParagraphs(label: string, raw: unknown): void {
  if (!raw || typeof raw !== "object") {
    console.info(`[story-writer] ${label}`, { raw });
    return;
  }
  const paragraphs = (raw as { paragraphs?: unknown }).paragraphs;
  if (!Array.isArray(paragraphs)) {
    console.info(`[story-writer] ${label}`, { raw });
    return;
  }
  console.info(`[story-writer] ${label}`, {
    preview: paragraphs.map((para: { chapter?: string; sentences?: { text?: string }[] }) => ({
      chapter: para.chapter,
      sentences: (para.sentences ?? []).map((s) => s.text ?? ""),
    })),
  });
}

export async function generateStory(input: GenerateStoryInput): Promise<ValidatedStoryResult> {
  const skeleton = buildSkeleton(input.pack, input.study, input.intent);
  const storyModel = input.model?.trim() || DEFAULT_STORY_WRITER_MODEL;
  console.info("[story-writer] skeleton_built", {
    model: storyModel,
    chapters: skeleton.chapters.map((c) => c.chapter),
    factCount: Object.keys(skeleton.facts).length,
  });

  if (input.fixtureProse?.kind === "prose") {
    return input.fixtureProse;
  }

  let raw: unknown;
  try {
    raw = await callStoryModel(skeleton, input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "STORY_MODEL_FAILED";
    console.error("[story-writer] model_failed", { message });
    return fallbackFromSkeleton(skeleton, [message]);
  }

  logStoryModelParagraphs("model_raw", raw);
  const sanitized = sanitizeStoryModelOutput(skeleton, raw) ?? raw;
  let validated = validateStory(skeleton, sanitized);
  if (validated.ok) {
    return { kind: "prose", story: validated.story };
  }

  console.info("[story-writer] validation_failed", {
    errors: validated.errors,
    skeletonFactValues: Object.fromEntries(
      Object.entries(skeleton.facts).map(([id, f]) => [id, f.value]),
    ),
  });
  try {
    raw = await callStoryModel(skeleton, input, validated.errors);
    logStoryModelParagraphs("model_retry_raw", raw);
    const retrySanitized = sanitizeStoryModelOutput(skeleton, raw) ?? raw;
    validated = validateStory(skeleton, retrySanitized);
    if (validated.ok) {
      return { kind: "prose", story: validated.story };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "STORY_MODEL_RETRY_FAILED";
    validated = { ok: false, errors: [...validated.errors, message] };
  }

  return fallbackFromSkeleton(skeleton, validated.errors);
}
