import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";
import type { CanonicalStudyProposal } from "@hiveforyou/shared/case-intelligence/3";
import { isCanonicalStudyProposalV4 } from "./validate-proposal-v4";
import type { VoiceProposal } from "@hiveforyou/shared/projections";

import type { CanonicalStudyEngineProposal } from "./engine-v3";
import { normalizeProposalV4ToV3 } from "./normalize-proposal-v4-to-v3";
import { sanitizeVoiceProposal } from "./sanitize-voice-proposal";

export function voiceProposalForProjection(
  context: CanonicalStudyContext,
  proposal: CanonicalStudyEngineProposal,
): VoiceProposal | null {
  const raw = isCanonicalStudyProposalV4(proposal)
    ? normalizeProposalV4ToV3(proposal).voiceProposal ?? null
    : (proposal as CanonicalStudyProposal).voiceProposal ?? null;
  return sanitizeVoiceProposal(context, raw);
}
