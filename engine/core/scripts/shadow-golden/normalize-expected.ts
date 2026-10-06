import type { Statement } from "../../src/atoms/types.ts";
import { validationAtomKey } from "../../src/atoms/validate.ts";
import type { StudyFinding } from "../../src/study/primitives/types.ts";

import type { GoldenPipelineResult } from "./run-pipeline.ts";
import { stableJson } from "./prompt-hash.ts";

export type ExpectedGolden = {
  documents: Record<
    string,
    {
      tier0Atoms: number;
      tier1Status: string;
      tier1Reason: string | null;
      tier1Atoms: number;
    }
  >;
  drops: Record<string, string[]>;
  facts: Array<{
    key: string;
    value: string;
    sources: Array<{ docSha256: string; page: number; quote: string }>;
  }>;
  multiSourceFacts: { count: number; keys: string[] };
  findings: Array<{
    key: string;
    kind: string;
    statementKeys: string[];
    sources: Array<{ docSha256: string; page: number; quote: string }>;
  }>;
  coverage: {
    covered: number;
    total: number;
    uncovered: Array<{ claimId: string; quote: string }>;
  };
};

function statementKey(statement: Statement, shaByDocId: Map<string, string>): string {
  const sha = shaByDocId.get(statement.documentId) ?? statement.documentId;
  const ev = statement.evidence[0];
  return validationAtomKey({
    documentId: sha,
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

function findingKey(
  finding: StudyFinding,
  statementKeys: string[],
): string {
  const sources = finding.evidence
    .map((e) => `${e.documentId}:${e.pageNumber}:${e.quote}`)
    .sort();
  return stableJson({
    kind: finding.kind,
    basis: finding.basis,
    detail: finding.detail,
    statementKeys: [...statementKeys].sort(),
    sources,
  });
}

export function buildExpectedGolden(
  result: GoldenPipelineResult,
  shaByDocId: Map<string, string>,
): ExpectedGolden {
  const statementKeyById = new Map<string, string>();
  for (const statement of result.statements) {
    statementKeyById.set(statement.id, statementKey(statement, shaByDocId));
  }

  const documents: ExpectedGolden["documents"] = {};
  for (const doc of result.documents) {
    documents[doc.sha256] = {
      tier0Atoms: doc.tier0AtomKeys.length,
      tier1Status: doc.tier1Status,
      tier1Reason: doc.tier1Reason,
      tier1Atoms: doc.tier1AtomKeys.length,
    };
  }

  const facts = result.findings
    .filter((f) => f.kind === "fact")
    .map((finding) => {
      const stmtKeys = finding.statementIds
        .map((id) => statementKeyById.get(id))
        .filter((k): k is string => Boolean(k));
      const primary = result.statements.find((s) => finding.statementIds.includes(s.id));
      return {
        key: findingKey(finding, stmtKeys),
        value: finding.detail,
        sources: finding.evidence.map((span) => ({
          docSha256: shaByDocId.get(span.documentId) ?? span.documentId,
          page: span.pageNumber,
          quote: span.quote,
        })),
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));

  const multi = facts.filter((f) => f.sources.length > 1);
  const multiSourceFacts = {
    count: multi.length,
    keys: multi.map((f) => f.key).sort(),
  };

  const findings = result.findings.map((finding) => {
    const stmtKeys = finding.statementIds
      .map((id) => statementKeyById.get(id))
      .filter((k): k is string => Boolean(k));
    return {
      key: findingKey(finding, stmtKeys),
      kind: finding.kind,
      statementKeys: [...stmtKeys].sort(),
      sources: finding.evidence.map((span) => ({
        docSha256: shaByDocId.get(span.documentId) ?? span.documentId,
        page: span.pageNumber,
        quote: span.quote,
      })),
    };
  });
  findings.sort((a, b) => a.key.localeCompare(b.key));

  const coverage = result.coverage
    ? {
        covered: result.coverage.coveredClaims,
        total: result.coverage.totalClaims,
        uncovered: result.coverage.uncoveredClaims
          .map((c) => ({ claimId: c.claimId, quote: c.primarySnippet }))
          .sort((a, b) => a.claimId.localeCompare(b.claimId)),
      }
    : { covered: 0, total: 0, uncovered: [] };

  const drops: Record<string, string[]> = {};
  for (const [reason, keys] of Object.entries(result.dropKeysByReason)) {
    drops[reason] = [...keys].sort();
  }

  return {
    documents,
    drops,
    facts,
    multiSourceFacts,
    findings,
    coverage,
  };
}

export function sortExpectedGolden(expected: ExpectedGolden): ExpectedGolden {
  const documents: ExpectedGolden["documents"] = {};
  for (const sha of Object.keys(expected.documents).sort()) {
    documents[sha] = expected.documents[sha]!;
  }
  const drops: Record<string, string[]> = {};
  for (const reason of Object.keys(expected.drops).sort()) {
    drops[reason] = [...(expected.drops[reason] ?? [])].sort();
  }
  return {
    documents,
    drops,
    facts: [...expected.facts].sort((a, b) => a.key.localeCompare(b.key)),
    multiSourceFacts: {
      count: expected.multiSourceFacts.count,
      keys: [...expected.multiSourceFacts.keys].sort(),
    },
    findings: [...expected.findings].sort((a, b) => a.key.localeCompare(b.key)),
    coverage: {
      covered: expected.coverage.covered,
      total: expected.coverage.total,
      uncovered: [...expected.coverage.uncovered].sort((a, b) =>
        a.claimId.localeCompare(b.claimId),
      ),
    },
  };
}
