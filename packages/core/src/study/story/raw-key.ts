const RAW_KEY_PATTERN = /^[A-Z_]+$/;

export class RawKeyError extends Error {
  constructor(field: string) {
    super(`RawKeyError: customer-facing field "${field}" still contains a raw key.`);
    this.name = "RawKeyError";
  }
}

export function assertNoRawKey(text: string, field: string): void {
  if (text.includes("_") || RAW_KEY_PATTERN.test(text.trim())) {
    throw new RawKeyError(field);
  }
}

export function plainValue(
  packValues: Record<string, Record<string, string>>,
  slot: string,
  raw: string,
): string {
  const parent = slot.includes(".") ? slot.split(".").slice(0, -1).join(".") : slot;
  const mapped =
    packValues[slot]?.[raw] ??
    packValues[parent]?.[raw] ??
    packValues[slot.split(".").slice(-2).join(".")]?.[raw];
  const out = mapped ?? raw;
  assertNoRawKey(out, slot);
  return out;
}
