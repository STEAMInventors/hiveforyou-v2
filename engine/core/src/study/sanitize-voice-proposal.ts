import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";
import type { EvidenceReference } from "@hiveforyou/shared/case-intelligence/3";
import type { VoiceProposal, VoiceProposalToken } from "@hiveforyou/shared/projections";

import { documentIdsInContext, validateDocumentEvidenceRefs } from "./validate-document-evidence";

function sanitizeToken(
  context: CanonicalStudyContext,
  token: VoiceProposalToken | undefined,
  path: string,
  requireDocumentRefs: boolean,
): VoiceProposalToken {
  const empty: VoiceProposalToken = { value: null, from: null };
  if (!token || typeof token !== "object") {
    return empty;
  }
  const from = token.from;
  if (from !== null && from !== "user_text" && from !== "document") {
    return empty;
  }
  if (from === "document" && requireDocumentRefs) {
    if (!Array.isArray(token.evidenceRefs) || token.evidenceRefs.length === 0) {
      return { value: null, from: null };
    }
    const knownDocs = documentIdsInContext(context);
    const provErrors = validateDocumentEvidenceRefs(
      context,
      path,
      token.evidenceRefs as EvidenceReference[],
      knownDocs,
      path,
      { requireAtLeastOne: true, requireLocator: true },
    );
    if (provErrors.length) {
      return { value: null, from: null };
    }
  }
  if (from === "user_text" && token.value && typeof token.value !== "string") {
    return empty;
  }
  if (from === null && token.value !== null) {
    return empty;
  }
  return {
    value: typeof token.value === "string" ? token.value : null,
    from,
    evidenceRefs: from === "document" ? token.evidenceRefs : undefined,
  };
}

export function sanitizeVoiceProposal(
  context: CanonicalStudyContext,
  raw: VoiceProposal | null | undefined,
): VoiceProposal | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  return {
    subject: sanitizeToken(context, raw.subject, "voiceProposal.subject", false),
    eventNoun: sanitizeToken(context, raw.eventNoun, "voiceProposal.eventNoun", false),
    helperNoun: sanitizeToken(context, raw.helperNoun, "voiceProposal.helperNoun", false),
    otherPartyNoun: sanitizeToken(context, raw.otherPartyNoun, "voiceProposal.otherPartyNoun", true),
    subjectName: sanitizeToken(context, raw.subjectName, "voiceProposal.subjectName", true),
  };
}
