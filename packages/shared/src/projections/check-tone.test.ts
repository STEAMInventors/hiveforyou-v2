import { describe, expect, it } from "vitest";

import { GENERIC_VOICE, type ResolvedVoice } from "./voice";
import { checkTone } from "./check-tone";

function resolved(overrides: Partial<ResolvedVoice> = {}): ResolvedVoice {
  return {
    ...GENERIC_VOICE,
    sources: {
      subject: "generic",
      eventNoun: "generic",
      helperNoun: "generic",
      otherPartyNoun: "generic",
      planNoun: "generic",
      documentsNoun: "generic",
    },
    subjectName: null,
    useSubjectName: false,
    ...overrides,
  };
}

describe("checkTone", () => {
  it("rejects exclamation and blocked openers", () => {
    expect(checkTone("Hello!", resolved()).ok).toBe(false);
    expect(checkTone("Unfortunately we found a gap.", resolved()).ok).toBe(false);
    expect(checkTone("You should ask about services.", resolved()).ok).toBe(false);
  });

  it("allows feeling words only when userText contains one", () => {
    expect(checkTone("You seem worried about the meeting.", resolved(), "").ok).toBe(false);
    expect(
      checkTone("You mentioned feeling worried about the meeting.", resolved(), "I'm worried").ok,
    ).toBe(true);
  });

  it("rejects sentences starting with otherPartyNoun", () => {
    const voice = resolved({ otherPartyNoun: "the school" });
    expect(checkTone("The school sent a notice.", voice, "").ok).toBe(false);
    expect(checkTone("Your documents mention a notice.", resolved({ otherPartyNoun: null }), "").ok).toBe(
      true,
    );
  });
});
