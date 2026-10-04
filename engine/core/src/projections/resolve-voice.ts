import {
  checkToneToken,
  GENERIC_VOICE,
  type PackVoice,
  type ResolvedVoice,
  type VoiceProposal,
  type VoiceProposalToken,
  type VoiceTokenSource,
  type VoiceTokens,
} from "@hiveforyou/shared/projections";

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function headNoun(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1] ?? value;
  return last.replace(/[^a-zA-Z'-]/g, "").toLowerCase();
}

function appearsInUserText(value: string, userText: string): boolean {
  const hay = userText.toLowerCase();
  const needle = value.trim().toLowerCase();
  if (needle && hay.includes(needle)) {
    return true;
  }
  const noun = headNoun(value);
  return noun.length > 1 && hay.includes(noun);
}

function tokenShapeOk(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 30) {
    return false;
  }
  const count = wordCount(trimmed);
  return count >= 1 && count <= 3;
}

function acceptProposalToken(
  token: VoiceProposalToken | undefined,
  expectedFrom: "user_text" | "document",
  userText: string,
  voice: ResolvedVoice,
  extraColdWords: string[],
  verifiedEvidence: (refs: NonNullable<VoiceProposalToken["evidenceRefs"]>) => boolean,
): string | null {
  if (!token?.value?.trim() || token.from !== expectedFrom) {
    return null;
  }
  const value = token.value.trim();
  if (!tokenShapeOk(value)) {
    return null;
  }
  const tone = checkToneToken(value, voice, userText, extraColdWords);
  if (!tone.ok) {
    return null;
  }
  if (expectedFrom === "user_text" && !appearsInUserText(value, userText)) {
    return null;
  }
  if (expectedFrom === "document") {
    const refs = token.evidenceRefs ?? [];
    if (!refs.length || !verifiedEvidence(refs)) {
      return null;
    }
  }
  return value;
}

function pickToken(
  proposalValue: string | null,
  proposalSource: VoiceTokenSource | null,
  packValue: string | null | undefined,
  genericValue: string | null | undefined,
  allowNullGeneric = false,
): { value: string | null; source: VoiceTokenSource } {
  if (proposalValue && proposalSource) {
    return { value: proposalValue, source: proposalSource };
  }
  if (packValue?.trim()) {
    return { value: packValue.trim(), source: "pack" };
  }
  if (genericValue?.trim()) {
    return { value: genericValue.trim(), source: "generic" };
  }
  if (allowNullGeneric) {
    return { value: null, source: "generic" };
  }
  return { value: GENERIC_VOICE.subject, source: "generic" };
}

export function resolveVoice(input: {
  proposal: VoiceProposal | null | undefined;
  userText: string;
  intentLabel: string | null;
  pack: PackVoice | null;
  verifiedEvidence: (refs: NonNullable<VoiceProposalToken["evidenceRefs"]>) => boolean;
}): ResolvedVoice {
  const userText = input.userText.trim();
  const extraCold = input.pack?.extraColdWords ?? [];
  const draftVoice: ResolvedVoice = {
    ...GENERIC_VOICE,
    subject: input.pack?.subjectDefault ?? GENERIC_VOICE.subject,
    eventNoun: input.pack?.eventNoun ?? GENERIC_VOICE.eventNoun,
    documentsNoun: input.pack?.documentsNoun ?? GENERIC_VOICE.documentsNoun,
    helperNoun: input.pack?.helperNoun ?? null,
    otherPartyNoun: input.pack?.otherPartyNoun ?? null,
    planNoun: input.pack?.planNoun ?? null,
    sources: {
      subject: "pack",
      eventNoun: "pack",
      helperNoun: "pack",
      otherPartyNoun: "pack",
      planNoun: "pack",
      documentsNoun: "pack",
    },
    subjectName: null,
    useSubjectName: false,
  };

  const proposal = input.proposal;
  const subjectProposal = acceptProposalToken(
    proposal?.subject,
    "user_text",
    userText,
    draftVoice,
    extraCold,
    input.verifiedEvidence,
  );
  const eventProposal = acceptProposalToken(
    proposal?.eventNoun,
    "user_text",
    userText,
    draftVoice,
    extraCold,
    input.verifiedEvidence,
  );
  const helperProposal = acceptProposalToken(
    proposal?.helperNoun,
    "user_text",
    userText,
    draftVoice,
    extraCold,
    input.verifiedEvidence,
  );
  const otherPartyProposal = acceptProposalToken(
    proposal?.otherPartyNoun,
    "document",
    userText,
    draftVoice,
    extraCold,
    input.verifiedEvidence,
  );

  const subjectPick = pickToken(
    subjectProposal,
    subjectProposal ? "user_text" : null,
    input.pack?.subjectDefault,
    GENERIC_VOICE.subject,
  );
  const eventPick = pickToken(
    eventProposal,
    eventProposal ? "user_text" : null,
    input.pack?.eventNoun,
    GENERIC_VOICE.eventNoun,
  );
  const helperPick = pickToken(
    helperProposal,
    helperProposal ? "user_text" : null,
    input.pack?.helperNoun ?? null,
    null,
    true,
  );
  const otherPartyPick = pickToken(
    otherPartyProposal,
    otherPartyProposal ? "document" : null,
    input.pack?.otherPartyNoun ?? null,
    null,
    true,
  );
  const planPick: { value: string | null; source: VoiceTokenSource } = input.pack?.planNoun?.trim()
    ? { value: input.pack.planNoun.trim(), source: "pack" }
    : { value: null, source: "generic" };
  const documentsPick = input.pack?.documentsNoun?.trim()
    ? { value: input.pack.documentsNoun.trim(), source: "pack" as const }
    : { value: GENERIC_VOICE.documentsNoun, source: "generic" as const };

  let subjectName: ResolvedVoice["subjectName"] = null;
  const nameToken = proposal?.subjectName;
  if (
    nameToken?.value?.trim() &&
    nameToken.from === "document" &&
    tokenShapeOk(nameToken.value) &&
    (nameToken.evidenceRefs?.length ?? 0) > 0 &&
    input.verifiedEvidence(nameToken.evidenceRefs ?? [])
  ) {
    subjectName = {
      value: nameToken.value.trim(),
      evidenceRefs: nameToken.evidenceRefs ?? [],
    };
  }

  const tokens: VoiceTokens = {
    subject: subjectPick.value ?? GENERIC_VOICE.subject,
    eventNoun: eventPick.value ?? GENERIC_VOICE.eventNoun,
    helperNoun: helperPick.value,
    otherPartyNoun: otherPartyPick.value,
    planNoun: planPick.value,
    documentsNoun: documentsPick.value,
  };

  return {
    ...tokens,
    sources: {
      subject: subjectPick.source,
      eventNoun: eventPick.source,
      helperNoun: helperPick.source,
      otherPartyNoun: otherPartyPick.source,
      planNoun: planPick.source,
      documentsNoun: documentsPick.source,
    },
    subjectName,
    useSubjectName: false,
  };
}
