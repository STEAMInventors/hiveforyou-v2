import { checkTone as checkToneShared } from "@hiveforyou/shared/projections";
import type { DomainPackViewConfigV2, ResolvedVoice } from "@hiveforyou/shared/projections";

export type ClientWriterModelOutput = {
  story: Array<{ slotId: string; text: string; itemIds: string[] }>;
  cards: Array<{
    cardId: string;
    oneLiner: string;
    sinceLine: string | null;
    whyLine: string | null;
    itemIds: string[];
  }>;
  timeline: Array<{ eventId: string; detail: string | null; itemIds: string[] }>;
  prep: {
    stayedSame: { text: string | null; itemIds: string[] } | null;
    questions: Array<{ questionId: string; text: string; itemIds: string[] }>;
  };
};

export function checkTone(
  text: string,
  voice: ResolvedVoice,
  userText: string,
  extraColdWords: string[] = [],
): string | null {
  const result = checkToneShared(text, voice, userText, extraColdWords);
  return result.ok ? null : result.reasons[0] ?? "tone";
}

export function writerVoiceConsistent(
  text: string,
  voice: ResolvedVoice,
  pack: DomainPackViewConfigV2,
): boolean {
  const packDefault = pack.voice.subjectDefault.trim().toLowerCase();
  if (voice.sources.subject !== "user_text") {
    return true;
  }
  if (!packDefault || packDefault === voice.subject.trim().toLowerCase()) {
    return true;
  }
  return !text.toLowerCase().includes(packDefault);
}

function extractNumbers(text: string): string[] {
  return text.match(/\d+(?:\.\d+)?/g) ?? [];
}

/** Reject text that introduces numbers not present in allowed display strings. */
export function numbersAllowedInText(text: string, allowedDisplays: string[]): boolean {
  const nums = extractNumbers(text);
  if (!nums.length) {
    return true;
  }
  const haystack = allowedDisplays.join(" ");
  return nums.every((n) => haystack.includes(n));
}

export function itemIdsSubset(itemIds: string[], allowed: Set<string>): boolean {
  return itemIds.length > 0 && itemIds.every((id) => allowed.has(id));
}
