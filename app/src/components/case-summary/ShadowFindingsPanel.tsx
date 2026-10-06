"use client";

import { useEffect, useState } from "react";

type ShadowArtifactResponse = {
  artifact: {
    status: string;
    failed_step: string | null;
    findings_json: unknown;
    coverage_json: {
      covered: number;
      total: number;
      uncoveredClaims: { claimId: string; primarySnippet: string }[];
    } | null;
    statements_count: number;
    facts_count: number;
    multi_source_facts_count: number;
    drops_json: Record<string, number> | null;
    token_usage_json: { tier1InputTokens?: number; tier1OutputTokens?: number } | null;
    started_at: string;
    completed_at: string | null;
  } | null;
};

type ShadowFindingRow = {
  id: string;
  kind: string;
  basis: string;
  statementSummary: string;
  sourceDocumentId: string;
  pageNumber: number;
  quote: string;
  sources: Array<{ sourceDocumentId: string; pageNumber: number; quote: string }>;
};

export function ShadowFindingsPanel({
  caseId,
  studyRunId,
}: {
  caseId: string;
  studyRunId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [artifact, setArtifact] = useState<ShadowArtifactResponse["artifact"]>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    void fetch(
      `/api/case/${encodeURIComponent(caseId)}/shadow-study?studyRunId=${encodeURIComponent(studyRunId)}`,
    )
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("load failed");
        }
        return (await res.json()) as ShadowArtifactResponse;
      })
      .then((body) => {
        if (!cancelled) {
          setArtifact(body.artifact);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [caseId, studyRunId]);

  if (loading) {
    return (
      <section className="pro-shadow-panel" aria-label="Shadow findings">
        <p className="pro-shadow-muted">Loading shadow study…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="pro-shadow-panel" aria-label="Shadow findings">
        <p className="pro-shadow-muted">Could not load shadow study.</p>
      </section>
    );
  }

  if (!artifact) {
    return (
      <section className="pro-shadow-panel" aria-label="Shadow findings">
        <h3 className="pro-shadow-title">Shadow findings</h3>
        <p className="pro-shadow-muted">Shadow study not run for this study run.</p>
      </section>
    );
  }

  const findings = (artifact.findings_json ?? []) as ShadowFindingRow[];
  const coverage = artifact.coverage_json;
  const multiSource = findings.filter((f) => f.sources.length > 1 && f.kind === "fact");

  return (
    <section className="pro-shadow-panel" aria-label="Shadow findings">
      <h3 className="pro-shadow-title">Shadow findings</h3>
      <p className="pro-shadow-meta">
        Status: <strong>{artifact.status}</strong>
        {artifact.failed_step ? ` (failed at ${artifact.failed_step})` : null}
      </p>
      {coverage ? (
        <p className="pro-shadow-meta">
          v4 coverage: {coverage.covered}/{coverage.total}
        </p>
      ) : null}
      {coverage && coverage.uncoveredClaims.length > 0 ? (
        <div className="pro-shadow-block">
          <h4 className="pro-shadow-subtitle">Uncovered v4 claims</h4>
          <ul className="pro-shadow-list">
            {coverage.uncoveredClaims.map((claim) => (
              <li key={claim.claimId}>
                <span className="pro-shadow-id">{claim.claimId}</span>
                {claim.primarySnippet ? (
                  <span className="pro-shadow-quote"> — {claim.primarySnippet}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {multiSource.length > 0 ? (
        <div className="pro-shadow-block">
          <h4 className="pro-shadow-subtitle">Multi-source facts</h4>
          <ul className="pro-shadow-list">
            {multiSource.map((fact) => (
              <li key={fact.id}>
                <div>{fact.statementSummary || fact.quote}</div>
                <ul>
                  {fact.sources.map((src, index) => (
                    <li key={`${fact.id}-${index}`}>
                      {src.sourceDocumentId} p.{src.pageNumber}: {src.quote}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="pro-shadow-block">
        <h4 className="pro-shadow-subtitle">Findings ({findings.length})</h4>
        <ul className="pro-shadow-list">
          {findings.map((row) => (
            <li key={row.id}>
              <span className="pro-shadow-kind">{row.kind}</span> — {row.statementSummary || row.quote}
              <div className="pro-shadow-quote">
                {row.sourceDocumentId} p.{row.pageNumber}: {row.quote}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
