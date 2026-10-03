import type { PackNarrativeChapter } from "@hiveforyou/shared/projections";
import {
  VALIDATED_STORY_SCHEMA,
  type ValidatedStoryProse,
  type ValidatedStoryResult,
} from "@hiveforyou/shared/projections";

import type { StorySkeleton } from "./types";
import { STORY_CHAPTER_ORDER } from "./types";

type ModelParagraph = {
  chapter: string;
  sentences: { text: string; factIds: string[] }[];
};

type ModelOutput = {
  paragraphs: ModelParagraph[];
};

const RAW_IN_TEXT = /\b[A-Z]{2,}_[A-Z_]+\b|_/;

export function chapterFactIds(chapter: StorySkeleton["chapters"][number]): Set<string> {
  const ids = new Set<string>();
  if (chapter.chapter === "then" || chapter.chapter === "now") {
    for (const id of chapter.factIds) {
      ids.add(id);
    }
  } else if (chapter.chapter === "since") {
    for (const s of chapter.series) {
      for (const p of s.points) {
        ids.add(p.factId);
        if (p.noteFactId) {
          ids.add(p.noteFactId);
        }
      }
      if (s.target) {
        ids.add(s.target.factId);
      }
    }
    for (const g of chapter.gaps) {
      ids.add(g.factId);
    }
  } else if (chapter.chapter === "next") {
    for (const d of chapter.diffs) {
      for (const id of d.factIds) {
        ids.add(id);
      }
    }
  } else if (chapter.chapter === "ask") {
    for (const id of chapter.factIds) {
      ids.add(id);
    }
  }
  return ids;
}

function normalizeDateToken(value: string): string[] {
  const tokens: string[] = [value];
  const year = value.match(/\b(20\d{2})\b/);
  if (year) {
    tokens.push(year[1]!);
  }
  return tokens;
}

function digitTokensInText(text: string): string[] {
  return [...text.matchAll(/\d+(\.\d+)?/g)].map((m) => m[0]!);
}

function numberTokensInFacts(factIds: string[], skeleton: StorySkeleton): string[] {
  const nums: string[] = [];
  for (const id of factIds) {
    const f = skeleton.facts[id];
    if (!f) {
      continue;
    }
    for (const part of [f.value, f.label, f.unit, f.date].filter(Boolean)) {
      nums.push(...digitTokensInText(part!));
    }
    if (f.date) {
      nums.push(...normalizeDateToken(f.date).filter((t) => /\d/.test(t)));
    }
  }
  return [...new Set(nums)];
}

/** Pick chapter facts so every number in the sentence appears in at least one cited fact. */
export function factIdsBackingNumbers(
  nums: string[],
  candidateIds: string[],
  skeleton: StorySkeleton,
): string[] {
  if (nums.length === 0) {
    return candidateIds.slice(0, 3);
  }
  const picked: string[] = [];
  for (const n of nums) {
    if (numberTokensInFacts(picked, skeleton).includes(n)) {
      continue;
    }
    const match = candidateIds.find(
      (id) => !picked.includes(id) && numberTokensInFacts([id], skeleton).includes(n),
    );
    if (match) {
      picked.push(match);
    }
  }
  const backed = numberTokensInFacts(picked, skeleton);
  if (nums.every((n) => backed.includes(n))) {
    return picked;
  }
  return picked.length > 0 ? picked : candidateIds.slice(0, 3);
}

/** Drop hallucinated factIds; fall back to chapter-allowed ids present in skeleton.facts. */
export function sanitizeStoryModelOutput(
  skeleton: StorySkeleton,
  output: unknown,
): ModelOutput | null {
  if (!output || typeof output !== "object") {
    return null;
  }
  const parsed = output as ModelOutput;
  if (!Array.isArray(parsed.paragraphs)) {
    return null;
  }
  return {
    paragraphs: parsed.paragraphs.map((para) => {
      const skChapter = skeleton.chapters.find((c) => c.chapter === para.chapter);
      if (!skChapter) {
        return para;
      }
      const allowed = chapterFactIds(skChapter);
      const allowedInFacts = [...allowed].filter((id) => skeleton.facts[id]);
      return {
        chapter: para.chapter,
        sentences: (para.sentences ?? []).map((s) => {
          const valid = (s.factIds ?? []).filter((id) => skeleton.facts[id] && allowed.has(id));
          let factIds =
            valid.length > 0 ? valid : allowedInFacts.length ? allowedInFacts.slice(0, 3) : [];
          const nums = s.text.match(/\d+(\.\d+)?/g) ?? [];
          if (nums.length) {
            const backed = new Set(numberTokensInFacts(factIds, skeleton));
            if (nums.some((n) => !backed.has(n))) {
              const fromModel = factIds.length ? factIds : [];
              const repaired = factIdsBackingNumbers(nums, allowedInFacts, skeleton);
              factIds = [...new Set([...fromModel.filter((id) => allowed.has(id)), ...repaired])];
            }
          }
          return { text: s.text, factIds };
        }),
      };
    }),
  };
}

export function validateStory(
  skeleton: StorySkeleton,
  output: unknown,
): { ok: true; story: ValidatedStoryProse } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!output || typeof output !== "object") {
    return { ok: false, errors: ["Output is not an object."] };
  }
  const parsed = output as ModelOutput;
  if (!Array.isArray(parsed.paragraphs)) {
    return { ok: false, errors: ["Missing paragraphs array."] };
  }

  const expectedChapters = skeleton.chapters.map((c) => c.chapter);
  const gotChapters = parsed.paragraphs.map((p) => p.chapter);
  if (gotChapters.length !== expectedChapters.length) {
    errors.push(`Expected ${expectedChapters.length} chapters, got ${gotChapters.length}.`);
  }
  for (let i = 0; i < expectedChapters.length; i++) {
    if (gotChapters[i] !== expectedChapters[i]) {
      errors.push(`Chapter order mismatch at index ${i}: expected ${expectedChapters[i]}, got ${gotChapters[i] ?? "none"}.`);
    }
  }

  for (const para of parsed.paragraphs) {
    const skChapter = skeleton.chapters.find((c) => c.chapter === para.chapter);
    if (!skChapter) {
      errors.push(`Unexpected chapter "${para.chapter}".`);
      continue;
    }
    const allowed = chapterFactIds(skChapter);
    if (!Array.isArray(para.sentences) || para.sentences.length === 0) {
      errors.push(`Chapter "${para.chapter}" has no sentences.`);
      continue;
    }
    if (para.chapter === "ask") {
      if (para.sentences.length !== 1) {
        errors.push(`Ask chapter must have exactly one sentence.`);
      }
      const text = para.sentences[0]?.text ?? "";
      if (!text.trim().endsWith("?")) {
        errors.push(`Ask sentence must end with "?".`);
      }
    }
    for (const sentence of para.sentences) {
      if (!sentence.factIds?.length) {
        errors.push(`Sentence in "${para.chapter}" missing factIds.`);
      }
      if (RAW_IN_TEXT.test(sentence.text)) {
        errors.push(`Raw key or underscore in sentence: ${sentence.text.slice(0, 40)}`);
      }
      if (/^(It |They |This goal|The plan)/.test(sentence.text)) {
        errors.push(`Unresolved reference opener: ${sentence.text.slice(0, 30)}`);
      }
      const allowedInFacts = [...allowed].filter((id) => skeleton.facts[id]);
      const nums = sentence.text.match(/\d+(\.\d+)?/g) ?? [];
      if (nums.length) {
        let factIds = (sentence.factIds ?? []).filter((id) => skeleton.facts[id] && allowed.has(id));
        const backed = new Set(numberTokensInFacts(factIds, skeleton));
        if (nums.some((n) => !backed.has(n))) {
          factIds = [
            ...new Set([
              ...factIds,
              ...factIdsBackingNumbers(nums, allowedInFacts, skeleton),
            ]),
          ];
          sentence.factIds = factIds;
        }
      }
      for (const fid of sentence.factIds ?? []) {
        if (!skeleton.facts[fid]) {
          errors.push(`Unknown factId "${fid}".`);
        } else if (!allowed.has(fid)) {
          errors.push(`factId "${fid}" not allowed in chapter "${para.chapter}".`);
        }
      }
      const allowedNums = numberTokensInFacts(sentence.factIds ?? [], skeleton);
      for (const n of nums) {
        if (!allowedNums.includes(n)) {
          errors.push(`Number "${n}" in sentence not backed by cited facts.`);
        }
      }
    }
  }

  if (errors.length) {
    return { ok: false, errors };
  }

  const story: ValidatedStoryProse = {
    schemaVersion: VALIDATED_STORY_SCHEMA,
    paragraphs: parsed.paragraphs.map((p) => ({
      chapter: p.chapter as PackNarrativeChapter,
      sentences: p.sentences.map((s) => ({ text: s.text, factIds: [...s.factIds] })),
    })),
  };
  return { ok: true, story };
}

export function fallbackFromSkeleton(
  skeleton: StorySkeleton,
  errors: string[],
): ValidatedStoryResult {
  const lines = Object.entries(skeleton.facts).map(([id, f]) => ({
    label: f.label,
    value: f.value,
    unit: f.unit,
    factIds: [id],
  }));
  return { kind: "fallback", lines, errors };
}
