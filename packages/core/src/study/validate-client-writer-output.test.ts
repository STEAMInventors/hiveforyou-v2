import { describe, expect, it } from "vitest";

import { GENERIC_VOICE, IEP_DOMAIN_VIEW } from "@hiveforyou/shared/projections";

import {
  checkTone,
  itemIdsSubset,
  numbersAllowedInText,
  writerVoiceConsistent,
} from "./validate-client-writer-output";

const baseVoice = {
  ...GENERIC_VOICE,
  subject: "your son",
  sources: {
    subject: "user_text" as const,
    eventNoun: "generic" as const,
    helperNoun: "generic" as const,
    otherPartyNoun: "generic" as const,
    planNoun: "generic" as const,
    documentsNoun: "generic" as const,
  },
  subjectName: null,
  useSubjectName: false,
};

describe("validateClientWriterOutput helpers", () => {
  it("rejects banned phrases", () => {
    expect(checkTone("Unfortunately we found a gap.", baseVoice, "")).toBe("blocked:unfortunately");
  });

  it("rejects pack default subject when resolved voice is user_text", () => {
    expect(writerVoiceConsistent("Ask about your child's goals.", baseVoice, IEP_DOMAIN_VIEW)).toBe(
      false,
    );
    expect(writerVoiceConsistent("Ask about your son's goals.", baseVoice, IEP_DOMAIN_VIEW)).toBe(
      true,
    );
  });

  it("requires item ids subset", () => {
    expect(itemIdsSubset(["a"], new Set(["a", "b"]))).toBe(true);
    expect(itemIdsSubset(["c"], new Set(["a"]))).toBe(false);
  });

  it("rejects numbers not in allowed displays", () => {
    expect(numbersAllowedInText("Goal is 110 wpm.", ["82 wpm"])).toBe(false);
    expect(numbersAllowedInText("Goal is 82 wpm.", ["82 wpm"])).toBe(true);
  });
});
