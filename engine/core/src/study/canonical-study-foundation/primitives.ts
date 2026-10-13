export type DerivedPrimitiveResult =
  | { ok: true; value: unknown; unit?: string | null }
  | { ok: false; reason: string };

const FREQUENCY_PATTERN =
  /(\d+)\s*(?:times?|x)\s*(?:per|\/)\s*(day|week|month|year|grading[_ ]period)/i;
const MINUTES_PER_SESSION_PATTERN = /(\d+(?:\.\d+)?)\s*minutes?/i;

export function parseFrequency(frequencyText: string): DerivedPrimitiveResult {
  const trimmed = frequencyText.trim();
  if (!trimmed) {
    return { ok: false, reason: "frequency_text is empty" };
  }
  const match = FREQUENCY_PATTERN.exec(trimmed);
  if (!match) {
    return { ok: false, reason: "frequency_text does not match parseFrequency pattern" };
  }
  const sessions = Number.parseInt(match[1]!, 10);
  const period = match[2]!.toLowerCase().replace(/\s+/g, "_");
  if (!Number.isFinite(sessions) || sessions <= 0) {
    return { ok: false, reason: "frequency_text sessions count invalid" };
  }
  return {
    ok: true,
    value: sessions,
    unit: null,
  };
}

const PERIOD_TO_WEEKS: Record<string, number> = {
  day: 1 / 7,
  week: 1,
  month: 52 / 12,
  year: 52,
  grading_period: 9,
};

export function ratePerWeek(input: {
  minutesPerSession: number;
  sessionsPerPeriod: number;
  period: string;
}): DerivedPrimitiveResult {
  const periodKey = input.period.trim().toLowerCase().replace(/\s+/g, "_");
  const weeksFactor = PERIOD_TO_WEEKS[periodKey];
  if (weeksFactor == null) {
    return { ok: false, reason: `period ${input.period} is not convertible to week` };
  }
  if (!Number.isFinite(input.minutesPerSession) || input.minutesPerSession <= 0) {
    return { ok: false, reason: "minutes_per_session invalid" };
  }
  if (!Number.isFinite(input.sessionsPerPeriod) || input.sessionsPerPeriod <= 0) {
    return { ok: false, reason: "sessions_per_period invalid" };
  }
  const minutesPerWeek = input.minutesPerSession * input.sessionsPerPeriod * weeksFactor;
  return {
    ok: true,
    value: Math.round(minutesPerWeek * 100) / 100,
    unit: "min/week",
  };
}

const EXPLICIT_WEEKLY_TOTAL = /^(\d+(?:\.\d+)?)\s+minutes?\s+(?:weekly|per\s+week)$/i;

/** Explicit total such as "150 minutes weekly" — not a session-times-frequency rate. */
export function explicitTotalPerWeek(expression: string): DerivedPrimitiveResult {
  const match = EXPLICIT_WEEKLY_TOTAL.exec(expression.trim());
  if (!match) {
    return { ok: false, reason: "expression is not an explicit total duration per week" };
  }
  const value = Number.parseFloat(match[1]!);
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, reason: "explicit total duration is not a positive number" };
  }
  return { ok: true, value, unit: "minutes_per_week" };
}

export function tryDerivedPrimitive(
  primitive: string,
  operands: Record<string, unknown>,
): DerivedPrimitiveResult {
  switch (primitive) {
    case "parseFrequency": {
      const text = operands.frequency_text;
      if (typeof text !== "string") {
        return { ok: false, reason: "parseFrequency operand frequency_text missing" };
      }
      return parseFrequency(text);
    }
    case "ratePerWeek": {
      const minutes = operands.minutes_per_session;
      const sessions = operands.sessions_per_period;
      const period = operands.period;
      if (typeof minutes !== "number" || typeof sessions !== "number" || typeof period !== "string") {
        return { ok: false, reason: "ratePerWeek operands missing or invalid" };
      }
      return ratePerWeek({
        minutesPerSession: minutes,
        sessionsPerPeriod: sessions,
        period,
      });
    }
    case "explicitTotalPerWeek": {
      const text = operands.frequency_text ?? operands.expression;
      if (typeof text !== "string") {
        return { ok: false, reason: "explicitTotalPerWeek operand frequency_text missing" };
      }
      return explicitTotalPerWeek(text);
    }
    default:
      return { ok: false, reason: `unsupported derivation primitive: ${primitive}` };
  }
}

export function extractMinutesFromFrequencyText(text: string): number | null {
  const match = MINUTES_PER_SESSION_PATTERN.exec(text);
  if (!match) {
    return null;
  }
  const value = Number.parseFloat(match[1]!);
  return Number.isFinite(value) ? value : null;
}
