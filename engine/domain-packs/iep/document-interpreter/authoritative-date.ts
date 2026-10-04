import type { IepDocumentFamily } from "./contracts";

/**
 * Document-date selection ported from NestIEP `lib/scan/date-types.ts`.
 * Goal, birth, review, and period-end dates are never the document date.
 */

const NEVER_AUTHORITATIVE = new Set([
  "birth_date",
  "prior_record_date",
  "historical_date",
  "goal_target_date",
  "goal_start_date",
  "service_start_date",
  "service_end_date",
  "signature_date",
  "review_date",
  "measurement_date",
  "other",
]);

const PREFERRED_ROLES: Record<string, string[]> = {
  IEP: ["iep_date", "meeting_date", "document_date"],
  ELIGIBILITY: ["eligibility_date", "meeting_date", "document_date"],
  PROGRESS: ["report_date", "measurement_date", "document_date"],
  EVAL_PLAN: ["evaluation_plan_date", "consent_date", "document_date"],
  EVALUATION: ["evaluation_date", "report_date", "document_date"],
  REFERRAL: ["referral_date", "document_date"],
  PWN: ["document_date", "meeting_date"],
  MEETING: ["meeting_date", "document_date"],
};

/** Specific labels first. Bare "IEP" is not an IEP date. */
const LABEL_ALIASES: Array<{ role: string; pattern: RegExp }> = [
  { role: "birth_date", pattern: /\bdob\b|\bdate of birth\b|\bbirth date\b|\bbirthday\b/i },
  {
    role: "goal_target_date",
    pattern: /\bgoal\s*target(?:\s*date)?\b|\btarget\s*date\b|\bgoal\s+completion(?:\s*date)?\b|\bcompletion\s+date\b/i,
  },
  { role: "goal_start_date", pattern: /\bgoal\s*start(?:\s*date)?\b|\bbaseline\s*date\b/i },
  {
    role: "review_date",
    pattern: /\bannual\s+review(?:\s*date)?\b|\breview\s*date\b|\bnext\s+review\b|\biep\s+review\s*date\b/i,
  },
  { role: "report_date", pattern: /\breport date\b|\bdate of (?:this )?report\b/i },
  {
    role: "eligibility_date",
    pattern: /\beligibility\s+(?:determination\s+)?date\b|\bdate\s+of\s+eligibility\b|\bdetermination\s+date\b/i,
  },
  { role: "evaluation_date", pattern: /\bevaluation\s*date\b|\bdate\s+of\s+(?:the\s+)?eval/i },
  { role: "consent_date", pattern: /\bconsent\s*date\b|\bdate\s+of\s+consent\b/i },
  { role: "referral_date", pattern: /\breferral\s*date\b|\bdate\s+of\s+referral\b/i },
  {
    role: "iep_date",
    pattern: /\biep\s+(?:meeting\s+)?date\b|\bdate\s+of\s+(?:the\s+)?iep(?:\s+meeting)?\b|\bdate\s+of\s+this\s+iep\b/i,
  },
  { role: "meeting_date", pattern: /\bmeeting\s*date\b|\bdate\s+of\s+(?:the\s+)?meeting\b/i },
  { role: "document_date", pattern: /\bdocument\s*date\b|\bdate\s+of\s+document\b|\bdated\b/i },
];

export type DateCandidate = {
  value: string;
  role: string;
  confidence: number;
};

function padIso(year: string, month: string, day: string): string | null {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isFinite(y) || m < 1 || m > 12 || d < 1 || d > 31) {
    return null;
  }
  const iso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) {
    return null;
  }
  return iso;
}

function parseFlexibleDate(raw: string): string | null {
  const text = raw.trim().replace(/\s+/g, " ");
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) {
    return padIso(iso[1]!, iso[2]!, iso[3]!);
  }
  const named = text.match(
    /^(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{1,2}),?\s+(\d{4})$/i,
  );
  if (named) {
    const months: Record<string, string> = {
      january: "1",
      jan: "1",
      february: "2",
      feb: "2",
      march: "3",
      mar: "3",
      april: "4",
      apr: "4",
      may: "5",
      june: "6",
      jun: "6",
      july: "7",
      jul: "7",
      august: "8",
      aug: "8",
      september: "9",
      sep: "9",
      sept: "9",
      october: "10",
      oct: "10",
      november: "11",
      nov: "11",
      december: "12",
      dec: "12",
    };
    const month = months[named[1]!.toLowerCase().replace(/\.$/, "")];
    if (!month) {
      return null;
    }
    return padIso(named[3]!, month, named[2]!);
  }
  const us = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (us) {
    return padIso(us[3]!, us[1]!, us[2]!);
  }
  return null;
}

function findDateOccurrences(text: string): Array<{ iso: string; index: number; length: number }> {
  const patterns = [
    /\b(20\d{2}|19\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/g,
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{1,2}),?\s+(20\d{2}|19\d{2})\b/gi,
    /\b(0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])[/-](20\d{2}|19\d{2})\b/g,
  ];
  const used = new Set<number>();
  const out: Array<{ iso: string; index: number; length: number }> = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const index = match.index ?? 0;
      if ([...used].some((start) => Math.abs(start - index) < 3)) {
        continue;
      }
      const iso = parseFlexibleDate(match[0]);
      if (!iso) {
        continue;
      }
      used.add(index);
      out.push({ iso, index, length: match[0].length });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

function roleAt(text: string, index: number, previousEnd: number): string {
  const before = text.slice(Math.max(previousEnd, index - 80), index);
  if (/\bthrough\b/i.test(before.slice(-20))) {
    return "service_end_date";
  }
  for (const row of LABEL_ALIASES) {
    if (row.pattern.test(before)) {
      return row.role;
    }
  }
  return "other";
}

export function dateCandidatesFromText(text: string): DateCandidate[] {
  const occurrences = findDateOccurrences(text);
  return occurrences.map((occurrence, index) => {
    const previousEnd =
      index === 0 ? 0 : occurrences[index - 1]!.index + occurrences[index - 1]!.length;
    const role = roleAt(text, occurrence.index, previousEnd);
    return {
      value: occurrence.iso,
      role,
      confidence: NEVER_AUTHORITATIVE.has(role) ? 0.4 : 0.9,
    };
  });
}

export function selectAuthoritativeDocumentDate(
  family: IepDocumentFamily | string,
  subtype: string | null | undefined,
  candidates: DateCandidate[],
): string | null {
  const usable = candidates.filter(
    (candidate) => !NEVER_AUTHORITATIVE.has(candidate.role) && candidate.confidence >= 0.7,
  );
  const preferred =
    subtype === "parent_evaluation_consent"
      ? ["consent_date", "document_date"]
      : (PREFERRED_ROLES[family] ?? ["document_date"]);
  for (const role of preferred) {
    const matches = usable
      .filter((candidate) => candidate.role === role)
      .sort((a, b) => b.confidence - a.confidence || b.value.localeCompare(a.value));
    if (matches[0]) {
      return matches[0].value;
    }
  }
  return null;
}

export function authoritativeDocumentDate(
  family: IepDocumentFamily | string,
  subtype: string | null | undefined,
  text: string,
): string | null {
  return selectAuthoritativeDocumentDate(family, subtype, dateCandidatesFromText(text));
}
