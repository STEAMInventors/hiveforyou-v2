import { matchParties } from "../../src/atoms/match.ts";
import { linkSectionSubjects } from "../../src/atoms/section-subject.ts";
import type { Party, Statement } from "../../src/atoms/types.ts";
import { validationAtomKey, validateAtoms } from "../../src/atoms/validate.ts";
import { assembleDocument } from "../../src/document/assembly.ts";
import type { CallModel } from "../../src/model/call-model.ts";
import { arithmeticFindings } from "../../src/study/primitives/arithmetic.ts";
import { requirementCoverageFindings } from "../../src/study/primitives/requirementCoverage.ts";
import { restatementFindings } from "../../src/study/primitives/restatement.ts";
import { seriesContinuityFindings } from "../../src/study/primitives/seriesContinuity.ts";
import type { StudyFinding } from "../../src/study/primitives/types.ts";
import {
  compareV4Coverage,
  type V4AcceptedClaim,
  type V4CoverageReport,
} from "../../src/study/shadow/compare-v4.ts";
import {
  shadowAssembleDocument,
  shadowTier1Document,
} from "../../src/study/shadow/shadow-steps.ts";
import type { ShadowDocTier1State, ShadowDocWorkState } from "../../src/study/shadow/shadow-state.ts";

import type { LoadedCaseDocument } from "./load-case.ts";

export type Tier1RunStatus = "ran" | "skipped" | "failed";

export type GoldenDocRow = {
  sha256: string;
  filename: string;
  tier0AtomKeys: string[];
  tier1Status: Tier1RunStatus;
  tier1Reason: string | null;
  tier1AtomKeys: string[];
  dropKeysByReason: Record<string, string[]>;
};

export type GoldenPipelineResult = {
  statements: Statement[];
  findings: StudyFinding[];
  validationDrops: Record<string, number>;
  coverage: V4CoverageReport | null;
  documents: GoldenDocRow[];
  dropKeysByReason: Record<string, string[]>;
};

function atomKeyForStatement(statement: Statement, sha256: string): string {
  const ev = statement.evidence[0];
  return validationAtomKey({
    documentId: sha256,
    tier: statement.tier,
    attributeRaw: statement.attributeRaw,
    valueNorm: statement.valueNorm,
    valueRaw: statement.valueRaw,
    quote: ev?.quote ?? statement.valueRaw ?? "",
    pageNumber: ev?.pageNumber ?? 0,
    blockId: ev?.blockId ?? "",
    cellId: ev?.cellId ?? null,
  });
}

function remapDropKeys(
  keys: string[],
  documentId: string,
  sha256: string,
): string[] {
  return keys.map((key) => key.replace(`${documentId}\u0000`, `${sha256}\u0000`));
}

export async function runShadowGoldenPipeline(input: {
  documents: LoadedCaseDocument[];
  callModel: CallModel;
  model: string;
  v4Claims: V4AcceptedClaim[];
  sourceIdToDocumentId: Map<string, string>;
  setDocSha256: (sha256: string) => void;
}): Promise<GoldenPipelineResult> {
  const docRows: GoldenDocRow[] = [];
  const corpusDocs: Array<{
    pages: LoadedCaseDocument["pages"];
    recoveredPages: LoadedCaseDocument["recoveredPages"];
    work: ShadowDocWorkState;
  }> = [];

  for (const doc of input.documents) {
    input.setDocSha256(doc.sha256);
    const { tier0Statements, things } = shadowAssembleDocument(doc.pages);
    const tier0AtomKeys = tier0Statements.map((s) => atomKeyForStatement(s, doc.sha256));

    let tier1: ShadowDocTier1State | null = null;
    let tier1Status: Tier1RunStatus = "ran";
    let tier1Reason: string | null = null;

    try {
      const { assembled } = shadowAssembleDocument(doc.pages);
      tier1 = await shadowTier1Document({
        assembled,
        callModel: input.callModel,
        model: input.model,
      });
    } catch (error) {
      tier1Status = "failed";
      tier1Reason = error instanceof Error ? error.message : String(error);
    }

    const tier1AtomKeys =
      tier1?.statements.map((s) => atomKeyForStatement(s, doc.sha256)) ?? [];

    if (tier1) {
      corpusDocs.push({
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

    docRows.push({
      sha256: doc.sha256,
      filename: doc.filename,
      tier0AtomKeys,
      tier1Status,
      tier1Reason,
      tier1AtomKeys,
      dropKeysByReason: {},
    });
  }

  const validationDrops: Record<string, number> = {};
  const dropKeysByReason: Record<string, string[]> = {};
  const statements: Statement[] = [];
  const findings: StudyFinding[] = [];
  const corpusParties: Party[] = [];
  const pageModelsByDoc = new Map<string, LoadedCaseDocument["pages"]["pages"]>();
  const recoveredPagesByDoc = new Map<string, LoadedCaseDocument["recoveredPages"]>();

  for (const doc of corpusDocs) {
    const { pages, recoveredPages, work } = doc;
    if (!work.tier0Statements || !work.things || !work.tier1) {
      continue;
    }
    const assembled = assembleDocument(pages);
    pageModelsByDoc.set(pages.documentId, pages.pages);
    recoveredPagesByDoc.set(pages.documentId, recoveredPages);

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

    const loaded = input.documents.find((d) => d.pages.documentId === pages.documentId);
    const sha256 = loaded?.sha256 ?? pages.documentId;
    const row = docRows.find((r) => r.sha256 === sha256);
    if (row) {
      const perDocDrops: Record<string, string[]> = {};
      for (const [reason, keys] of Object.entries(metrics.dropKeysByReason)) {
        const remapped = remapDropKeys(keys, pages.documentId, sha256);
        perDocDrops[reason] = remapped;
        dropKeysByReason[reason] = [...(dropKeysByReason[reason] ?? []), ...remapped].sort();
      }
      row.dropKeysByReason = perDocDrops;
    }

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
  const coverage = compareV4Coverage({
    claims: input.v4Claims,
    facts,
    sourceIdToDocumentId: input.sourceIdToDocumentId,
    recoveredPagesByDoc,
    pageModelsByDoc,
  });

  for (const reason of Object.keys(dropKeysByReason)) {
    dropKeysByReason[reason] = [...new Set(dropKeysByReason[reason])].sort();
  }

  return {
    statements,
    findings,
    validationDrops,
    coverage,
    documents: docRows.sort((a, b) => a.sha256.localeCompare(b.sha256)),
    dropKeysByReason,
  };
}
