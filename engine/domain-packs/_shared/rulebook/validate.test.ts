import { describe, expect, it } from "vitest";

import { iepDomainPack } from "@hiveforyou/domain-pack-iep";

import { validate } from "./validate.ts";
import type { Rulebook } from "./schema.ts";

describe("validate", () => {
  it("passes for the special-education rulebook", () => {
    expect(iepDomainPack.rulebook).toBeDefined();
    const result = validate(iepDomainPack.rulebook!, iepDomainPack);
    expect(result).toEqual({ ok: true });
  });

  it("fails for unknown rule ref", () => {
    const book = structuredClone(iepDomainPack.rulebook!);
    book.guides[0]!.sections[0]!.rules.push("idea:999.999");
    const result = validate(book, iepDomainPack);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("unknown rule"))).toBe(true);
    }
  });

  it("fails for unknown term id", () => {
    const book = structuredClone(iepDomainPack.rulebook!);
    book.guides[0]!.basics.push("not-a-term");
    const result = validate(book, iepDomainPack);
    expect(result.ok).toBe(false);
  });

  it("fails for unknown slot", () => {
    const book = structuredClone(iepDomainPack.rulebook!);
    book.guides[0]!.sections[0]!.slots.push("missing.slot");
    const result = validate(book, iepDomainPack);
    expect(result.ok).toBe(false);
  });

  it("fails for verdict word in Rule.plain", () => {
    const book = structuredClone(iepDomainPack.rulebook!);
    book.rules[0]!.plain = "The district violated IDEA.";
    const result = validate(book, iepDomainPack);
    expect(result.ok).toBe(false);
  });

  it("fails for regulation term with empty cites", () => {
    const book = structuredClone(iepDomainPack.rulebook!);
    book.terms.push({
      id: "badterm",
      term: "Bad",
      plain: "x",
      cites: [],
      source: "regulation",
    });
    const result = validate(book, iepDomainPack);
    expect(result.ok).toBe(false);
  });

  it("fails for duplicate term id", () => {
    const book = structuredClone(iepDomainPack.rulebook!);
    book.terms.push({ ...book.terms[0]! });
    const result = validate(book, iepDomainPack);
    expect(result.ok).toBe(false);
  });
});
