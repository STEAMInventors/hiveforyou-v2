/** Compatible with case-intelligence EvidenceReference (study proposal voice refs). */
export type VoiceEvidenceRef = {
  id: string;
  sourceDocumentId: string;
  logicalDocumentId?: string;
  page?: number;
  pageEnd?: number;
  spanStart?: number;
  spanEnd?: number;
  snippet?: string;
  extractionId?: string;
  sourceType: "document";
};

export type VoiceTokenSource = "user_text" | "document" | "intent" | "pack" | "generic";

export interface VoiceTokens {
  subject: string;
  eventNoun: string;
  helperNoun: string | null;
  otherPartyNoun: string | null;
  planNoun: string | null;
  documentsNoun: string;
}

export interface VoiceProposalToken {
  value: string | null;
  from: "user_text" | "document" | null;
  evidenceRefs?: VoiceEvidenceRef[];
}

export interface VoiceProposal {
  subject: VoiceProposalToken;
  eventNoun: VoiceProposalToken;
  helperNoun: VoiceProposalToken;
  otherPartyNoun: VoiceProposalToken;
  subjectName: VoiceProposalToken;
}

export interface ResolvedVoice extends VoiceTokens {
  sources: Record<keyof VoiceTokens, VoiceTokenSource>;
  subjectName: { value: string; evidenceRefs: VoiceEvidenceRef[] } | null;
  useSubjectName: boolean;
}

export const GENERIC_VOICE: VoiceTokens = {
  subject: "you",
  eventNoun: "what's coming up",
  helperNoun: null,
  otherPartyNoun: null,
  planNoun: null,
  documentsNoun: "your documents",
};

/** Pack defaults for client voice (domain-specific; not used as GENERIC_VOICE). */
export interface PackVoice {
  subjectDefault: string;
  documentsNoun: string;
  planNoun: string | null;
  eventNoun: string;
  otherPartyNoun: string | null;
  helperNoun: string | null;
  extraColdWords: string[];
}

export function emptyVoiceProposal(): VoiceProposal {
  const empty: VoiceProposalToken = { value: null, from: null };
  return {
    subject: { ...empty },
    eventNoun: { ...empty },
    helperNoun: { ...empty },
    otherPartyNoun: { ...empty },
    subjectName: { value: null, from: null },
  };
}
