import type { NestIepRecoveredPage } from "@hiveforyou/shared/intake";

import { runAtomsForDocument } from "../../atoms/run-atoms";
import { matchParties } from "../../atoms/match";
import type { Party, Statement } from "../../atoms/types";
import { assembleDocument } from "../../document/assembly";
import type { DocumentPages } from "../../document/page-model";
import type { CallModel } from "../../model/call-model";
import { arithmeticFindings } from "../primitives/arithmetic";
import { requirementCoverageFindings } from "../primitives/requirementCoverage";
import { restatementFindings } from "../primitives/restatement";
import { seriesContinuityFindings } from "../primitives/seriesContinuity";
import type { StudyFinding } from "../primitives/types";
import { compareV4Coverage, type V4AcceptedClaim, type V4CoverageReport } from "./compare-v4";
import { computeStability } from "./stability";

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
  const validationDrops: Record<string, number> = {};
  let tier1InputTokens = 0;
  let tier1OutputTokens = 0;

  const pageModelsByDoc = new Map<string, DocumentPages["pages"]>();
  const recoveredPagesByDoc = new Map<string, NestIepRecoveredPage[]>();

  async function runPass(collectValidationDrops: boolean): Promise<{
    statements: Statement[];
    findings: StudyFinding[];
    tier0: Statement[];
  }> {
    const statements: Statement[] = [];
    const findings: StudyFinding[] = [];
    const tier0Statements: Statement[] = [];
    const corpusParties: Party[] = [];

    for (const doc of input.documents) {
      const assembled = assembleDocument(doc.pages);
      pageModelsByDoc.set(doc.pages.documentId, doc.pages.pages);
      recoveredPagesByDoc.set(doc.pages.documentId, doc.recoveredPages);

      const atoms = await runAtomsForDocument({
        pages: doc.pages,
        assembled,
        callModel: input.callModel,
        model: input.model,
        issuedDate: null,
      });
      tier1InputTokens += atoms.usage.tier1.inputTokens;
      tier1OutputTokens += atoms.usage.tier1.outputTokens;
      if (collectValidationDrops) {
        for (const [reason, count] of Object.entries(atoms.validationDrops)) {
          validationDrops[reason] = (validationDrops[reason] ?? 0) + count;
        }
      }

      tier0Statements.push(...atoms.tier0);
      statements.push(...atoms.statements);
      corpusParties.push(...atoms.parties);

      findings.push(
        ...arithmeticFindings({ assembled, statements: atoms.statements }),
        ...seriesContinuityFindings({
          profiles: atoms.profiles,
          accountIdByDocument: new Map(),
          partyMatches: atoms.partyMatches,
        }),
        ...requirementCoverageFindings({ profiles: atoms.profiles }),
      );
    }

    findings.push(
      ...restatementFindings({
        statements,
        partyMatches: matchParties(corpusParties),
      }),
    );

    return { statements, findings, tier0: tier0Statements };
  }

  const firstPass = await runPass(true);
  let stability: ReturnType<typeof computeStability> | null = null;

  if (input.runTier1Twice) {
    const secondPass = await runPass(false);
    stability = computeStability({
      tier0A: firstPass.tier0,
      tier0B: secondPass.tier0,
      statementsA: firstPass.statements,
      statementsB: secondPass.statements,
      findingsA: firstPass.findings,
      findingsB: secondPass.findings,
    });
  }

  const facts = firstPass.findings.filter((f) => f.kind === "fact");
  const coverage =
    input.v4Claims && input.sourceIdToDocumentId
      ? compareV4Coverage({
          claims: input.v4Claims,
          facts,
          sourceIdToDocumentId: input.sourceIdToDocumentId,
          recoveredPagesByDoc,
          pageModelsByDoc,
        })
      : null;

  return {
    statements: firstPass.statements,
    findings: firstPass.findings,
    coverage,
    stability,
    validationDrops,
    usage: { tier1InputTokens, tier1OutputTokens },
  };
}
