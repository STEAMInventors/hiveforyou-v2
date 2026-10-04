import type { ResolvedVoice } from "./voice";

export const DEFAULT_BLOCKED_WORDS = [
  "unfortunately",
  "don't worry",
  "do not worry",
  "rest assured",
  "simply",
  "must",
  "you should",
  "make sure",
  "you didn't",
  "you forgot",
  "failed",
  "violation",
  "warning",
  "urgent",
  "problem",
  "issue",
  "red flag",
  "just",
  "obviously",
];

const FEELING_WORD_PATTERN =
  /\b(stress\w*|overwhelm\w*|worried|anxious|scared|frustrat\w*|confus\w*|upset)\b/i;

export function checkTone(
  sentence: string,
  voice: ResolvedVoice,
  userText: string,
  extraColdWords: string[] = [],
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const text = sentence.trim();
  if (!text) {
    return { ok: false, reasons: ["empty"] };
  }
  if (text.includes("!")) {
    reasons.push("exclamation");
  }
  const lower = text.toLowerCase();
  const blocked = [...DEFAULT_BLOCKED_WORDS, ...extraColdWords];
  for (const phrase of blocked) {
    if (phrase && lower.includes(phrase.toLowerCase())) {
      reasons.push(`blocked:${phrase}`);
    }
  }
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 22) {
    reasons.push("too_long");
  }
  if (FEELING_WORD_PATTERN.test(text) && !FEELING_WORD_PATTERN.test(userText)) {
    reasons.push("feeling_without_user");
  }
  if (voice.otherPartyNoun?.trim()) {
    const party = voice.otherPartyNoun.trim().toLowerCase();
    if (lower.startsWith(party)) {
      reasons.push("other_party_subject");
    }
  }
  return { ok: reasons.length === 0, reasons };
}

/** Short token check for proposed voice values (single phrase, not full sentences). */
export function checkToneToken(
  value: string,
  voice: ResolvedVoice,
  userText: string,
  extraColdWords: string[] = [],
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const text = value.trim();
  if (!text) {
    return { ok: false, reasons: ["empty"] };
  }
  if (text.includes("!")) {
    reasons.push("exclamation");
  }
  const lower = text.toLowerCase();
  for (const phrase of [...DEFAULT_BLOCKED_WORDS, ...extraColdWords]) {
    if (phrase && lower.includes(phrase.toLowerCase())) {
      reasons.push(`blocked:${phrase}`);
    }
  }
  if (/\b(fail\w*|violation|warning|urgent|problem|issue)\b/i.test(text)) {
    reasons.push("blocked_token");
  }
  if (FEELING_WORD_PATTERN.test(text) && !FEELING_WORD_PATTERN.test(userText)) {
    reasons.push("feeling_without_user");
  }
  return { ok: reasons.length === 0, reasons };
}
