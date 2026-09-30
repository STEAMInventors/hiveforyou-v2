import { CANONICAL_STUDY_PROPOSAL_SCHEMA } from "@hiveforyou/shared/canonical-study";
import { CANONICAL_STUDY_PROPOSAL_SCHEMA_V3 } from "@hiveforyou/shared/case-intelligence/3";

import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";



import type { LoadedCanonicalStudyPrompt } from "./load-canonical-study-prompt";



export type CanonicalStudyPromptInputs = {

  system: string;

  prompt: LoadedCanonicalStudyPrompt;

  studyContext: CanonicalStudyContext;

  evidenceReferences: CanonicalStudyContext["sourceDocuments"];

  answerSnapshot: CanonicalStudyContext["answerSnapshot"];

  analysisIntent: CanonicalStudyContext["answerSnapshot"]["analysisIntent"];

  /** Customer objective — emphasis only, not documentary evidence. */

  customerContext?: CanonicalStudyContext["customerContext"];

  outputSchema: typeof CANONICAL_STUDY_PROPOSAL_SCHEMA | typeof CANONICAL_STUDY_PROPOSAL_SCHEMA_V3;

};



/**

 * Binds the stable methodology prompt file to one run's evidence and structure context.

 * Case-specific content stays outside the prompt file.

 */

export function composeCanonicalStudyPromptInputs(

  prompt: LoadedCanonicalStudyPrompt,

  context: CanonicalStudyContext,

): CanonicalStudyPromptInputs {

  if (prompt.version === "latest") {

    throw new Error("UNKNOWN_PROMPT_VERSION");

  }

  return {

    system: prompt.content,

    prompt,

    studyContext: context,

    evidenceReferences: context.sourceDocuments.map((doc) => ({

      stagedDocumentId: doc.stagedDocumentId,

      discoveryDocumentId: doc.discoveryDocumentId,

      originalFilename: doc.originalFilename,

      sizeBytes: doc.sizeBytes,

      mimeType: doc.mimeType,

      sourceDocumentId: doc.sourceDocumentId,

      sha256: doc.sha256,

      storageBucket: doc.storageBucket,

      storagePath: doc.storagePath,

    })),

    answerSnapshot: context.answerSnapshot,

    analysisIntent: context.answerSnapshot.analysisIntent,

    customerContext: context.customerContext,

    outputSchema:
      prompt.version === "v3"
        ? CANONICAL_STUDY_PROPOSAL_SCHEMA_V3
        : CANONICAL_STUDY_PROPOSAL_SCHEMA,

  };

}

