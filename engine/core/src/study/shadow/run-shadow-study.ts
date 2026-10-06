import type { NestIepRecoveredPage } from "@hiveforyou/shared/intake";

import type { Statement } from "../../atoms/types";
import type { DocumentPages } from "../../document/page-model";
import type { CallModel } from "../../model/call-model";
import type { StudyFinding } from "../primitives/types";
import type { V4AcceptedClaim, V4CoverageReport } from "./compare-v4";
import { computeStability } from "./stability";
import {
  shadowAssembleDocument,
  shadowFinalizeCorpus,
  shadowTier1Document,
} from "./shadow-steps";
import type { ShadowDocWorkState } from "./shadow-state";

export type ShadowDocumentInput = {
  pages: DocumentPages;
  recoveredPages: NestIepRecoveredPage[];
};

export type ShadowStudyResult = {
  statements: Statement[];
  findings: StudyFinding[];
  coverage: V4CoverageReport | null;
  stability: ReturnType<typeof computeStability> | null;
  validationDrops: Record<string, number>;
  usage: {
    tier1InputTokens: number;
    tier1OutputTokens: number;
  };
};

export async function runShadowStudy(input: {
  documents: ShadowDocumentInput[];
  callModel: CallModel;
  model: string;
  v4Claims?: V4AcceptedClaim[];
  sourceIdToDocumentId?: Map<string, string>;
  runTier1Twice?: boolean;
}): Promise<ShadowStudyResult> {
  async function runPass(): Promise<{
    result: Omit<ShadowStudyResult, "stability">;
    tier0: Statement[];
  }> {
    const docWorks: Array<{
      pages: DocumentPages;
      recoveredPages: NestIepRecoveredPage[];
      work: ShadowDocWorkState;
    }> = [];

    for (const doc of input.documents) {
      const { assembled, tier0Statements, things } = shadowAssembleDocument(doc.pages);
      const tier1 = await shadowTier1Document({
        assembled,
        callModel: input.callModel,
        model: input.model,
      });
      docWorks.push({
        pages: doc.pages,
        recoveredPages: doc.recoveredPages,
        work: {
          sourceDocumentId: doc.pages.documentId,
          documentId: doc.pages.documentId,
          tier0Statements,
          things,
          tier1,
        },
      });
    }

    const finalized = shadowFinalizeCorpus({
      documents: docWorks,
      v4Claims: input.v4Claims,
      sourceIdToDocumentId: input.sourceIdToDocumentId,
    });

    const tier0 = docWorks.flatMap((d) => d.work.tier0Statements ?? []);

    return {
      result: {
        statements: finalized.statements,
        findings: finalized.findings,
        coverage: finalized.coverage,
        validationDrops: finalized.validationDrops,
        usage: finalized.usage,
      },
      tier0,
    };
  }

  const firstPass = await runPass();
  let stability: ReturnType<typeof computeStability> | null = null;

  if (input.runTier1Twice) {
    const secondPass = await runPass();
    stability = computeStability({
      tier0A: firstPass.tier0,
      tier0B: secondPass.tier0,
      statementsA: firstPass.result.statements,
      statementsB: secondPass.result.statements,
      findingsA: firstPass.result.findings,
      findingsB: secondPass.result.findings,
    });
  }

  return {
    ...firstPass.result,
    stability,
  };
}
