import { matchParties } from "../../atoms/match";
import { linkSectionSubjects } from "../../atoms/section-subject";
import { runTier1Semantic } from "../../atoms/semantic";
import { extractTier0Structural } from "../../atoms/structural";
import type { Party, Statement } from "../../atoms/types";
import { validateAtoms } from "../../atoms/validate";
import { assembleDocument } from "../../document/assembly";
import type { DocumentPages } from "../../document/page-model";
import type { CallModel } from "../../model/call-model";
import { arithmeticFindings } from "../primitives/arithmetic";
import { requirementCoverageFindings } from "../primitives/requirementCoverage";
import { restatementFindings } from "../primitives/restatement";
import { seriesContinuityFindings } from "../primitives/seriesContinuity";
import type { StudyFinding } from "../primitives/types";
import {
  compareV4Coverage,
  type V4AcceptedClaim,
  type V4CoverageReport,
} from "./compare-v4";
import type { NestIepRecoveredPage } from "@hiveforyou/shared/intake";
import type { ShadowDocTier1State, ShadowDocWorkState } from "./shadow-state";

export function shadowAssembleDocument(pages: DocumentPages) {
  const assembled = assembleDocument(pages);
  const tier0 = extractTier0Structural({
    pages,
    assembled,
    issuedDate: null,
  });
  return { assembled, tier0Statements: tier0.statements, things: tier0.things };
}

export async function shadowTier1Document(input: {
  assembled: ReturnType<typeof assembleDocument>;
  callModel: CallModel;
  model: string;
}): Promise<ShadowDocTier1State> {
  const tier1 = await runTier1Semantic({
    assembled: input.assembled,
    callModel: input.callModel,
    model: input.model,
  });
  return {
    profile: tier1.profile,
    statements: tier1.statements,
    parties: tier1.parties,
    references: tier1.references,
    terms: tier1.terms,
    usage: tier1.usage,
  };
}

export type ShadowCorpusResult = {
  statements: Statement[];
  findings: StudyFinding[];
  validationDrops: Record<string, number>;
  usage: { tier1InputTokens: number; tier1OutputTokens: number };
  coverage: V4CoverageReport | null;
};

export function shadowFinalizeCorpus(input: {
  documents: Array<{
    pages: DocumentPages;
    recoveredPages: NestIepRecoveredPage[];
    work: ShadowDocWorkState;
  }>;
  v4Claims?: V4AcceptedClaim[];
  sourceIdToDocumentId?: Map<string, string>;
}): ShadowCorpusResult {
  const validationDrops: Record<string, number> = {};
  let tier1InputTokens = 0;
  let tier1OutputTokens = 0;

  const statements: Statement[] = [];
  const findings: StudyFinding[] = [];
  const corpusParties: Party[] = [];
  const pageModelsByDoc = new Map<string, DocumentPages["pages"]>();
  const recoveredPagesByDoc = new Map<string, NestIepRecoveredPage[]>();

  for (const doc of input.documents) {
    const { pages, recoveredPages, work } = doc;
    if (!work.tier0Statements || !work.things || !work.tier1) {
      throw new Error("SHADOW_DOC_INCOMPLETE");
    }
    const assembled = assembleDocument(pages);
    pageModelsByDoc.set(pages.documentId, pages.pages);
    recoveredPagesByDoc.set(pages.documentId, recoveredPages);

    tier1InputTokens += work.tier1.usage.inputTokens;
    tier1OutputTokens += work.tier1.usage.outputTokens;

    const combinedStatements = [...work.tier0Statements, ...work.tier1.statements];
    const { validated, metrics } = validateAtoms({
      assembled,
      pages,
      statements: combinedStatements,
      parties: work.tier1.parties,
      things: work.things,
      references: work.tier1.references,
      terms: work.tier1.terms,
      profiles: [work.tier1.profile],
    });
    for (const [reason, count] of Object.entries(metrics.dropsByReason)) {
      validationDrops[reason] = (validationDrops[reason] ?? 0) + count;
    }

    const partyMatches = matchParties(validated.parties);
    const docStatements = linkSectionSubjects({
      assembled,
      statements: validated.statements,
    });

    statements.push(...docStatements);
    corpusParties.push(...validated.parties);

    findings.push(
      ...arithmeticFindings({ assembled, statements: docStatements }),
      ...seriesContinuityFindings({
        profiles: validated.profiles,
        accountIdByDocument: new Map(),
        partyMatches,
      }),
      ...requirementCoverageFindings({ profiles: validated.profiles }),
    );
  }

  findings.push(
    ...restatementFindings({
      statements,
      partyMatches: matchParties(corpusParties),
    }),
  );

  const facts = findings.filter((f) => f.kind === "fact");
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
    statements,
    findings,
    validationDrops,
    usage: { tier1InputTokens, tier1OutputTokens },
    coverage,
  };
}

export type ShadowFindingForUi = {
  id: string;
  kind: StudyFinding["kind"];
  basis: StudyFinding["basis"];
  statementSummary: string;
  sourceDocumentId: string;
  pageNumber: number;
  quote: string;
  statementIds: string[];
  sources: Array<{ sourceDocumentId: string; pageNumber: number; quote: string }>;
};

export function shadowFindingsForUi(
  findings: StudyFinding[],
  statements: Statement[],
): ShadowFindingForUi[] {
  const statementById = new Map(statements.map((s) => [s.id, s]));
  return findings.map((finding) => {
    const primaryStatement = finding.statementIds
      .map((id) => statementById.get(id))
      .find(Boolean);
    const primaryEvidence = finding.evidence[0];
    const sources = finding.evidence.map((span) => ({
      sourceDocumentId: span.documentId,
      pageNumber: span.pageNumber,
      quote: span.quote,
    }));
    return {
      id: finding.id,
      kind: finding.kind,
      basis: finding.basis,
      statementSummary: primaryStatement?.valueRaw ?? primaryStatement?.attributeRaw ?? finding.detail,
      sourceDocumentId: primaryEvidence?.documentId ?? "",
      pageNumber: primaryEvidence?.pageNumber ?? 0,
      quote: primaryEvidence?.quote ?? "",
      statementIds: finding.statementIds,
      sources,
    };
  });
}
