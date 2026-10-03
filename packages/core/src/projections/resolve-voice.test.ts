import { describe, expect, it } from "vitest";

import { GENERIC_VOICE, type PackVoice, type VoiceProposal } from "@hiveforyou/shared/projections";

import { resolveVoice } from "./resolve-voice";

const iepPack: PackVoice = {
  subjectDefault: "your child",
  documentsNoun: "your documents",
  planNoun: "IEP",
  eventNoun: "meeting",
  otherPartyNoun: "the school",
  helperNoun: "Hive",
  extraColdWords: [],
};

function verifiedAlways() {
  return true;
}

function verifiedNever() {
  return false;
}

describe("resolveVoice", () => {
  it("accepts subject and event from user_text when present in userText", () => {
    const proposal: VoiceProposal = {
      subject: { value: "your son", from: "user_text" },
      eventNoun: { value: "meeting", from: "user_text" },
      helperNoun: { value: null, from: null },
      otherPartyNoun: { value: null, from: null },
      subjectName: { value: null, from: null },
    };
    const voice = resolveVoice({
      proposal,
      userText: "my son's IEP meeting next week",
      intentLabel: null,
      pack: iepPack,
      verifiedEvidence: verifiedAlways,
    });
    expect(voice.subject).toBe("your son");
    expect(voice.sources.subject).toBe("user_text");
    expect(voice.eventNoun).toBe("meeting");
    expect(voice.sources.eventNoun).toBe("user_text");
  });

  it("falls back to pack when proposal subject not in userText", () => {
    const proposal: VoiceProposal = {
      subject: { value: "your daughter", from: "user_text" },
      eventNoun: { value: null, from: null },
      helperNoun: { value: null, from: null },
      otherPartyNoun: { value: null, from: null },
      subjectName: { value: null, from: null },
    };
    const voice = resolveVoice({
      proposal,
      userText: "help with my son",
      intentLabel: null,
      pack: iepPack,
      verifiedEvidence: verifiedAlways,
    });
    expect(voice.subject).toBe("your child");
    expect(voice.sources.subject).toBe("pack");
  });

  it("nulls otherParty when document refs fail verification", () => {
    const proposal: VoiceProposal = {
      subject: { value: null, from: null },
      eventNoun: { value: null, from: null },
      helperNoun: { value: null, from: null },
      otherPartyNoun: {
        value: "the agency",
        from: "document",
        evidenceRefs: [{ id: "e1", sourceDocumentId: "d1", sourceType: "document" }],
      },
      subjectName: { value: null, from: null },
    };
    const voice = resolveVoice({
      proposal,
      userText: "",
      intentLabel: null,
      pack: iepPack,
      verifiedEvidence: verifiedNever,
    });
    expect(voice.otherPartyNoun).toBe("the school");
    expect(voice.sources.otherPartyNoun).toBe("pack");
  });

  it("uses GENERIC_VOICE when no pack and no proposal", () => {
    const voice = resolveVoice({
      proposal: null,
      userText: "",
      intentLabel: null,
      pack: null,
      verifiedEvidence: verifiedAlways,
    });
    expect(voice.subject).toBe(GENERIC_VOICE.subject);
    expect(voice.eventNoun).toBe(GENERIC_VOICE.eventNoun);
    expect(voice.documentsNoun).toBe(GENERIC_VOICE.documentsNoun);
    expect(Object.values(voice.sources).every((s) => s === "generic" || s === "pack")).toBe(true);
    expect(voice.sources.subject).toBe("generic");
    expect(voice.sources.documentsNoun).toBe("generic");
  });

  it("rejects toxic proposal tokens via checkTone", () => {
    const proposal: VoiceProposal = {
      subject: { value: "the failing school", from: "user_text" },
      eventNoun: { value: null, from: null },
      helperNoun: { value: null, from: null },
      otherPartyNoun: { value: null, from: null },
      subjectName: { value: null, from: null },
    };
    const voice = resolveVoice({
      proposal,
      userText: "the failing school paperwork",
      intentLabel: null,
      pack: iepPack,
      verifiedEvidence: verifiedAlways,
    });
    expect(voice.subject).toBe("your child");
    expect(voice.sources.subject).toBe("pack");
  });

  it("stores verified subjectName but keeps useSubjectName false", () => {
    const proposal: VoiceProposal = {
      subject: { value: null, from: null },
      eventNoun: { value: null, from: null },
      helperNoun: { value: null, from: null },
      otherPartyNoun: { value: null, from: null },
      subjectName: {
        value: "Alex R.",
        from: "document",
        evidenceRefs: [{ id: "e1", sourceDocumentId: "d1", sourceType: "document", snippet: "Alex R." }],
      },
    };
    const voice = resolveVoice({
      proposal,
      userText: "",
      intentLabel: null,
      pack: iepPack,
      verifiedEvidence: verifiedAlways,
    });
    expect(voice.subjectName?.value).toBe("Alex R.");
    expect(voice.useSubjectName).toBe(false);
    expect(voice.subject).toBe("your child");
  });
});
