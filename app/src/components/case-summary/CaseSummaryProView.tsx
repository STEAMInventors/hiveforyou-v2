"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import { rankViews, type ProViewId } from "@hiveforyou/core/pro-rank-views";
import { getDomainPackByDomainId } from "@hiveforyou/domain-packs";

import type { ProposedClaim } from "@hiveforyou/shared/canonical-study";
import type { CaseMapViewBundle } from "@/lib/case-map/case-map-view-bundle";
import type { ProvenanceIndex } from "@/lib/case/provenance-index";
import {
  shouldShowEvidenceChipLabel,
  type CaseSummaryPanelSpec,
} from "@/lib/case-summary/case-summary-evidence";
import type {
  ProCell,
  ProCoverageRow,
  ProLedgerRow,
  ProMeasureSeriesView,
  ProRow,
  ProSignal,
  ProTimelineEntry,
  ProViewModel,
} from "@hiveforyou/core/pro-view-model/types";
import { buildProViewModelForBundle } from "@/lib/case-summary/build-pro-view-for-bundle";
import { quotesByFactIdFromCaseView } from "@/lib/case-summary/pro-quotes-from-case-view";
import { buildStudyFromBundle } from "@/lib/case-summary/pro-study-from-bundle";

import { HfyChipButton, HfyChipStatic } from "@/components/hfy/HfyChip";

import { ShadowFindingsPanel } from "./ShadowFindingsPanel";
import { ProExportBuilder } from "./ProExportBuilder";
import { ProRankMark, ProViewIcon } from "./pro-view-icons";
import "./pro-workspace.css";
import { buildProLivingModelForBundle } from "@/lib/case-summary/case-view-pro-living";
import {
  buildProLivingExportJson,
  formatFactDisplay,
  monYear,
  PRO_COMPARE_STATE_LABEL,
  type ProCompareRow,
  type ProLivingModel,
  type ProTypedFact,
} from "@/lib/case-summary/case-summary-pro-living";
import { downloadTextFile } from "@/lib/case-summary/case-summary-pro-presentation";
import type { CaseSummaryModel } from "@/lib/case-summary/case-summary-presentation";

import {
  CheckedEvidenceChip,
  SearchedEvidenceChip,
  SourceEvidenceChip,
} from "./CaseSummaryChips";
import { HiveProLogo } from "@/components/HiveWordmark";

const PRO_UNLOCKED = true;

const PRO_VIEW_STORAGE_KEY = "hive.pro.view";

const TALLY_COLORS: Record<string, string> = {
  changed: "#E0A21B",
  added: "#4285F4",
  dropped: "#8A939E",
  reconfirmed: "#34A853",
  "not-compared": "#D5DAE0",
};

const VIEW_LABELS: Record<ProViewId, string> = {
  brief: "Meeting brief",
  side: "Prior vs proposed",
  trends: "Trends & timeline",
  ledger: "Evidence ledger",
};

type CaseSummaryProViewProps = {
  caseId: string;
  studyRunId: string;
  bundle: CaseMapViewBundle;
  summary: CaseSummaryModel;
  claimsById: Map<string, ProposedClaim>;
  provenance: ProvenanceIndex | null;
  documentLabels: string[];
  /** Same handler as parent view — opens CaseSummaryEvidencePanel */
  onOpen: (spec: CaseSummaryPanelSpec) => void;
  hidden?: boolean;
  onSwitchToParent?: () => void;
};

export function CaseSummaryProView({
  caseId,
  studyRunId,
  bundle,
  summary,
  claimsById,
  provenance,
  documentLabels,
  onOpen,
  hidden = false,
  onSwitchToParent,
}: CaseSummaryProViewProps) {
  const [activeView, setActiveView] = useState<ProViewId | null>(null);
  const [hideSame, setHideSame] = useState(false);
  const [ledgerDoc, setLedgerDoc] = useState<string>("all");
  const [ledgerQ, setLedgerQ] = useState("");

  useEffect(() => {
    const stored = window.localStorage.getItem(PRO_VIEW_STORAGE_KEY) as ProViewId | null;
    if (stored === "brief" || stored === "side" || stored === "trends" || stored === "ledger") {
      setActiveView(stored);
    }
  }, []);
  const openEvidence = useCallback(
    (spec: CaseSummaryPanelSpec) => {
      if (typeof onOpen === "function") {
        onOpen(spec);
      }
    },
    [onOpen],
  );
  const studiedAt = bundle.canonicalSnapshot?.createdAt
    ? new Date(bundle.canonicalSnapshot.createdAt).toISOString().slice(0, 10)
    : null;

  const quotesByFactId = useMemo(
    () => (bundle.caseView ? quotesByFactIdFromCaseView(bundle.caseView) : {}),
    [bundle.caseView],
  );

  const proViewModel = useMemo(
    () => buildProViewModelForBundle({ bundle, summary, quotesByFactId }),
    [bundle, summary, quotesByFactId],
  );

  const study = useMemo(() => buildStudyFromBundle(bundle), [bundle]);
  const pack = useMemo(
    () =>
      bundle.canonicalSnapshot
        ? getDomainPackByDomainId(bundle.canonicalSnapshot.domainId)
        : null,
    [bundle.canonicalSnapshot],
  );
  const rankedViews = useMemo(
    () => (study && pack ? rankViews(study, pack.pro.viewWeights) : []),
    [study, pack],
  );

  const pickView = useCallback((id: ProViewId) => {
    setActiveView(id);
    window.localStorage.setItem(PRO_VIEW_STORAGE_KEY, id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (activeView === null && rankedViews.length > 0) {
      setActiveView(rankedViews[0]!.id);
    }
  }, [activeView, rankedViews]);

  const model = useMemo(
    () =>
      buildProLivingModelForBundle({
        caseView: bundle.caseView,
        caseMap: bundle.caseMap!,
        summary,
        claims: [...claimsById.values()],
        provenance,
        sourceDocuments:
          bundle.canonicalSnapshot?.sourceDocuments?.map((doc) => ({
            sourceDocumentId: doc.sourceDocumentId ?? doc.stagedDocumentId,
            originalFilename: doc.originalFilename,
          })) ?? [],
        entities:
          bundle.caseView?.entities?.map((entity) => ({
            label: entity.displayName,
            entityType: entity.entityType,
          })) ??
          bundle.proView?.entities?.map((entity) => ({
            label: entity.label,
            entityType: entity.entityType,
          })),
        studiedAt,
      }),
    [bundle, summary, claimsById, provenance, studiedAt],
  );

  const showChooser = activeView === null && rankedViews.length > 0;
  const viewVisible = (id: ProViewId) => !proViewModel || activeView === id;

  const comparisonTally = useMemo(() => {
    if (!study) {
      return [];
    }
    const states = ["changed", "added", "dropped", "reconfirmed", "not-compared"] as const;
    return states
      .map((state) => ({
        state,
        count: study.slotComparisons.filter((c) => c.state === state).length,
      }))
      .filter((x) => x.count > 0);
  }, [study]);

  const exportJsonPreview = useMemo(
    () => (proViewModel ? JSON.stringify({ header: proViewModel.header }, null, 2) : "{}"),
    [proViewModel],
  );

  if (hidden) {
    return null;
  }

  const shell = Boolean(proViewModel && pack);
  const studentName = proViewModel?.header.title.split(" · ")[0] ?? model.studentLabel;
  const whatLine =
    proViewModel?.header.facts.map((f) => f.text).join(" · ") ?? model.caseTypeLabel;

  return (
    <div
      className={`case-summary-pro${shell ? " pro-shell" : ""}`}
      data-testid="case-summary-pro-view"
    >
      {shell ? (
        <header className="pro-top">
          <div className="brand">
            <HiveProLogo linkHome />
          </div>
          <span className="early" data-testid="case-summary-pro-preview-banner">
            <b>Pro preview.</b> Free during early access.
          </span>
          {onSwitchToParent ? (
            <button
              type="button"
              className="parent-link"
              data-testid="case-summary-view-parent"
              onClick={onSwitchToParent}
            >
              Parent view
            </button>
          ) : null}
        </header>
      ) : (
        <header>
          <div className="brand">
            <HiveProLogo linkHome />
          </div>
          <div className="btns">
            {onSwitchToParent ? (
              <button type="button" className="btn" data-testid="case-summary-view-parent" onClick={onSwitchToParent}>
                Parent view
              </button>
            ) : null}
            <button
              type="button"
              className="btn"
              data-testid="case-summary-export-csv"
              disabled={!PRO_UNLOCKED}
              onClick={() => exportCsv(model)}
            >
              Export CSV
            </button>
            <button
              type="button"
              className="btn dark"
              data-testid="case-summary-export-json"
              disabled={!PRO_UNLOCKED}
              onClick={() => exportJson(model)}
            >
              Export case data
            </button>
          </div>
        </header>
      )}

      <main>
        {!shell && PRO_UNLOCKED ? (
          <div className="preview" data-testid="case-summary-pro-preview-banner">
            <b>Pro preview.</b> Open to everyone during early access — this view will be part of Pro.
          </div>
        ) : null}

        {shell && proViewModel && pack ? (
          <div className="pro-desk">
            <aside className="pro-side-rail" aria-label="Case and views">
              <section className="case" aria-label="Case">
                <h1>{studentName}</h1>
                <p className="what">{whatLine}</p>
                <dl>
                  {proViewModel.header.facts.slice(0, 1).map((f) => (
                    <Fragment key={f.label}>
                      <dt>{f.label}</dt>
                      <dd>{f.text}</dd>
                    </Fragment>
                  ))}
                  <dt>Record</dt>
                  <dd>{proViewModel.header.recordSpan || "—"}</dd>
                  <dt>Read</dt>
                  <dd>
                    {proViewModel.header.documentCount} documents, {proViewModel.ledger.length} facts
                  </dd>
                </dl>
                {comparisonTally.length ? (
                  <div className="tally">
                    <div className="tally-bar" aria-hidden>
                      {comparisonTally.map((t) => (
                        <i
                          key={t.state}
                          style={{ flex: t.count, background: TALLY_COLORS[t.state] ?? "#ccc" }}
                        />
                      ))}
                    </div>
                    <div className="tally-keys">
                      {comparisonTally.map((t) => (
                        <span key={t.state}>
                          <span className="k" style={{ background: TALLY_COLORS[t.state] }} />
                          {t.count}{" "}
                          {(
                            PRO_COMPARE_STATE_LABEL[
                              (t.state === "not-compared" ? "notcompared" : t.state) as keyof typeof PRO_COMPARE_STATE_LABEL
                            ] ?? t.state
                          ).toLowerCase()}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
              <ShadowFindingsPanel caseId={caseId} studyRunId={studyRunId} />
              <nav aria-label="Views">
                <p className="railhead">Read this case as</p>
                <div className="views">
                  {rankedViews.map((v, i) => (
                    <button
                      key={v.id}
                      type="button"
                      className="vbtn"
                      aria-current={activeView === v.id ? "true" : undefined}
                      onClick={() => pickView(v.id)}
                    >
                      <ProViewIcon id={v.id} />
                      <b>
                        {VIEW_LABELS[v.id]}
                        {i === 0 ? <span className="sug">Suggested</span> : null}
                      </b>
                      <small>{v.why}</small>
                    </button>
                  ))}
                </div>
              </nav>
              <nav aria-label="Export">
                <p className="railhead">Take data out</p>
                <div className="views">
                  <button
                    type="button"
                    className="vbtn"
                    onClick={() =>
                      document.getElementById("pro-export-section")?.scrollIntoView({ behavior: "smooth" })
                    }
                  >
                    <ProViewIcon id="export" />
                    <b>Build an export</b>
                    <small>Ask for data in plain words; get a table, CSV or JSON.</small>
                  </button>
                </div>
              </nav>
            </aside>
            <div className="pro-content">
              <div className="content-inner">
                {showChooser ? (
                  <section className="chooser" data-testid="pro-view-chooser">
                    <h2>How do you want to read this case?</h2>
                    <p className="lead">
                      Hive suggests the <b>{VIEW_LABELS[rankedViews[0]?.id ?? "brief"].toLowerCase()}</b>:{" "}
                      {rankedViews[0]?.why}
                    </p>
                  </section>
                ) : null}
                <div hidden={!viewVisible("brief")}>
                  <ProReviewFirstSection
                    signals={proViewModel.signals}
                    groups={proViewModel.groups}
                    documentCount={proViewModel.header.documentCount}
                    onOpen={openEvidence}
                  />
                </div>
                <div hidden={!viewVisible("side")}>
                  <ProPriorProposedSection
                    groups={proViewModel.groups}
                    hideSame={hideSame}
                    onHideSameChange={setHideSame}
                    onOpen={openEvidence}
                  />
                </div>
                <div hidden={!viewVisible("trends")}>
                  <ProMeasuresSection model={proViewModel} onOpen={openEvidence} />
                  <div className="two">
                    <ProRecordTimeline entries={proViewModel.timeline} onOpen={openEvidence} />
                    <ProReadingIntegrity rows={proViewModel.coverage} onOpen={openEvidence} />
                  </div>
                </div>
                <div hidden={!viewVisible("ledger")}>
                  <ProLedgerSection
                    rows={proViewModel.ledger}
                    docFilter={ledgerDoc}
                    query={ledgerQ}
                    onDocFilter={setLedgerDoc}
                    onQuery={setLedgerQ}
                    onOpen={openEvidence}
                  />
                </div>
                <ProExportBuilder
                  caseId={caseId}
                  studyRunId={studyRunId}
                  examples={pack.pro.exportExamples}
                  caseJson={exportJsonPreview}
                />
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="top">
              <h1>{`${model.studentLabel} · ${model.caseTypeLabel}`}</h1>
            </div>
            <ReviewFirstSection
              model={model}
              summary={summary}
              provenance={provenance}
              documentLabels={documentLabels}
              onOpen={openEvidence}
            />
            <PriorProposedSection model={model} provenance={provenance} onOpen={openEvidence} />
          </>
        )}
      </main>
    </div>
  );
}

function StateBadge({ state }: { state: keyof typeof PRO_COMPARE_STATE_LABEL }) {
  const key = state in PRO_COMPARE_STATE_LABEL ? state : "changed";
  return <span className={`badge s-${key}`}>{PRO_COMPARE_STATE_LABEL[key]}</span>;
}

function ProChipButton({
  chip,
  onOpen,
}: {
  chip: { label: string; factId?: string };
  onOpen: (spec: CaseSummaryPanelSpec) => void;
}) {
  if (!shouldShowEvidenceChipLabel(chip.label)) {
    return null;
  }
  if (!chip.factId) {
    return <HfyChipStatic className="mono">{chip.label}</HfyChipStatic>;
  }
  return (
    <HfyChipButton
      className="mono"
      data-testid="case-summary-evidence-chip"
      onClick={() => onOpen({ t: "one", claimId: chip.factId! })}
    >
      {chip.label}
    </HfyChipButton>
  );
}

function ProCellView({ cell, onOpen }: { cell: ProCell; onOpen: (spec: CaseSummaryPanelSpec) => void }) {
  if ("empty" in cell) {
    const label =
      cell.empty === "not-in-document"
        ? "Not in this document"
        : cell.empty === "not-applicable"
          ? "Not applicable"
          : "Not captured by Hive";
    return <span className="none">{label}</span>;
  }
  return (
    <>
      {cell.values.map((v) => (
        <div className="v" key={`${v.text}-${v.chip.label}`}>
          {v.text}
          <small>
            <ProChipButton chip={v.chip} onOpen={onOpen} />
          </small>
        </div>
      ))}
    </>
  );
}

function ProLedgerSection({
  rows,
  docFilter,
  query,
  onDocFilter,
  onQuery,
  onOpen,
}: {
  rows: ProLedgerRow[];
  docFilter: string;
  query: string;
  onDocFilter: (v: string) => void;
  onQuery: (v: string) => void;
  onOpen: (spec: CaseSummaryPanelSpec) => void;
}) {
  const docs = ["all", ...new Set(rows.map((r) => r.chip.label.split(" · ")[0] ?? ""))];
  const q = query.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (docFilter !== "all" && !row.chip.label.startsWith(docFilter)) {
      return false;
    }
    if (!q) {
      return true;
    }
    return (
      row.label.toLowerCase().includes(q) ||
      row.valueText.toLowerCase().includes(q) ||
      row.quote.toLowerCase().includes(q)
    );
  });
  return (
    <section aria-label="Evidence ledger">
      <div className="vhead">
        <div>
          <h2>Evidence ledger</h2>
          <p>Every fact Hive read, oldest first, with the exact words from the page.</p>
        </div>
        <span className="quiet">{filtered.length} facts</span>
      </div>
      <div className="lbar">
        <div className="docpills" role="group" aria-label="Filter by document">
          {docs.map((d) => (
            <button
              key={d}
              type="button"
              className="dp"
              aria-pressed={docFilter === d}
              onClick={() => onDocFilter(d)}
            >
              {d === "all" ? "All" : d}
            </button>
          ))}
        </div>
        <input
          className="search"
          type="search"
          placeholder="Search: goal, label, quote"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      </div>
      {filtered.length === 0 ? (
        <p>No facts match. Clear the search or pick another document.</p>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Fact</th>
                <th>Value</th>
                <th>Source</th>
                <th>On the page</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.factId}>
                  <td className="num">{row.dateLabel}</td>
                  <td>{row.label}</td>
                  <td>
                    <b>{row.valueText}</b>
                  </td>
                  <td>
                    <ProChipButton chip={row.chip} onOpen={onOpen} />
                  </td>
                  <td className="q">“{row.quote}”</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function proBadgeClass(state: ProSignal["state"]): string {
  if (state === "gap") {
    return "badge b-record-gap";
  }
  if (state === "dropped") {
    return "badge b-dropped";
  }
  if (state === "changed") {
    return "badge b-changed";
  }
  if (state === "added") {
    return "badge b-added";
  }
  return "badge b-not-compared";
}

function proBadgeLabel(state: ProSignal["state"]): string {
  if (state === "gap") {
    return "Gap";
  }
  return PRO_COMPARE_STATE_LABEL[state as keyof typeof PRO_COMPARE_STATE_LABEL] ?? state;
}

function formatAskQuestion(question: string): string {
  return question.replace(/^Ask:\s*/i, "").trim();
}

function SignalDelta({ signal }: { signal: ProSignal }) {
  if (signal.state === "gap") {
    return <div className="delta gapd">{signal.detail}</div>;
  }
  if (signal.state === "changed" && signal.detail.includes("→")) {
    const [was, now] = signal.detail.split("→").map((s) => s.trim());
    return (
      <div className="delta">
        <span className="was">{was}</span>
        <span className="arr">→</span>
        <span className="now">{now}</span>
      </div>
    );
  }
  if (signal.detail) {
    return <div className="delta">{signal.detail}</div>;
  }
  return null;
}

function ProReviewFirstSection({
  signals,
  groups,
  documentCount,
  onOpen,
}: {
  signals: ProSignal[];
  groups: { rows: ProRow[] }[];
  documentCount: number;
  onOpen: (spec: CaseSummaryPanelSpec) => void;
}) {
  const changes = groups
    .flatMap((g) => g.rows)
    .filter((r) => ["changed", "added", "dropped"].includes(r.state));

  return (
    <section aria-label="Review first">
      <div className="vhead">
        <div>
          <h2>Review first</h2>
          <p>Ranked by how much each item is likely to matter at the meeting.</p>
        </div>
      </div>
      <div className="signals">
        {signals.map((signal) => (
          <article className="sig" key={`${signal.title}-${signal.rank}`}>
            <ProRankMark rank={signal.rank} />
            <div className="body">
              <div className="meta-row">
                <span className={proBadgeClass(signal.state)}>{proBadgeLabel(signal.state)}</span>
              </div>
              <h3>{signal.title}</h3>
              <SignalDelta signal={signal} />
              <div className="chips">
                {signal.state === "gap" ? (
                  <HfyChipStatic variant="searched">Searched {documentCount} documents</HfyChipStatic>
                ) : null}
                {signal.chips.map((chip) => (
                  <ProChipButton key={chip.label} chip={chip} onOpen={onOpen} />
                ))}
              </div>
              {signal.question ? (
                <div className="ask-block">
                  <b>Ask</b>
                  <span>{formatAskQuestion(signal.question)}</span>
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {changes.length ? (
        <section className="also">
          <h3>Every change in the new IEP</h3>
          <div className="alist">
            {changes.map((row) => {
              const prior =
                "values" in row.prior ? row.prior.values.map((v) => v.text).join(", ") : "Not in prior IEP";
              const current =
                "values" in row.current
                  ? row.current.values.map((v) => v.text).join(", ")
                  : "Not in new IEP";
              return (
                <div key={row.id}>
                  <span className={proBadgeClass(row.state as ProSignal["state"])}>
                    {proBadgeLabel(row.state as ProSignal["state"])}
                  </span>
                  <b>{row.label}</b>
                  <span className="quiet">
                    {prior} → {current}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function ProPriorProposedSection({
  groups,
  hideSame,
  onHideSameChange,
  onOpen,
}: {
  groups: { sectionId: string; title: string; rows: ProRow[] }[];
  hideSame?: boolean;
  onHideSameChange?: (v: boolean) => void;
  onOpen: (spec: CaseSummaryPanelSpec) => void;
}) {
  const filtered = groups
    .map((g) => ({
      ...g,
      rows: g.rows.filter((r) => !(hideSame && r.state === "reconfirmed")),
    }))
    .filter((g) => g.rows.length > 0);
  return (
    <section aria-label="Prior versus proposed">
      <div className="vhead">
        <div>
          <h2>Prior vs proposed</h2>
          <p>Compared by what each item is, not by wording. Items that stayed the same are shown quietly so changes stand out.</p>
        </div>
        {onHideSameChange ? (
          <label className="tog">
            <input
              type="checkbox"
              checked={hideSame ?? false}
              onChange={(e) => onHideSameChange(e.target.checked)}
              data-testid="pro-hide-same-toggle"
            />
            Hide items that stayed the same
          </label>
        ) : null}
      </div>
      <div className="tbl" data-testid="case-summary-pro-table">
        <div className="row head">
          <span />
          <span>Prior</span>
          <span>Proposed</span>
          <span>State</span>
        </div>
        {filtered.map((group) => (
          <div key={group.sectionId}>
            <div className="row group">{group.title}</div>
            {group.rows.map((row) => (
              <div className="row" key={row.id}>
                <div className="cell">
                  <span className="lab">{row.label}</span>
                </div>
                <div className="cell pl">
                  <ProCellView cell={row.prior} onOpen={onOpen} />
                </div>
                <div className="cell pr">
                  <ProCellView cell={row.current} onOpen={onOpen} />
                </div>
                <div className="cell">
                  <StateBadge state={row.state} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function ClaimEvidenceChips({
  claimIds,
  provenance,
  onOpen,
}: {
  claimIds: string[];
  provenance: ProvenanceIndex | null;
  onOpen: (spec: CaseSummaryPanelSpec) => void;
}) {
  const unique = [...new Set(claimIds)];
  return (
    <>
      {unique.map((claimId) => (
        <SourceEvidenceChip key={claimId} claimId={claimId} provenance={provenance} onOpen={onOpen} />
      ))}
    </>
  );
}

function DocumentEvidenceChips({
  docId,
  model,
  provenance,
  onOpen,
}: {
  docId: string;
  model: ProLivingModel;
  provenance: ProvenanceIndex | null;
  onOpen: (spec: CaseSummaryPanelSpec) => void;
}) {
  const claimIds = [...new Set(model.facts.filter((f) => f.sourceDocumentId === docId).map((f) => f.claimId))];
  if (!claimIds.length) {
    return null;
  }
  if (claimIds.length === 1) {
    return <SourceEvidenceChip claimId={claimIds[0]!} provenance={provenance} onOpen={onOpen} />;
  }
  return <ClaimEvidenceChips claimIds={claimIds.slice(0, 3)} provenance={provenance} onOpen={onOpen} />;
}

function ReviewFirstSection({
  model,
  summary,
  provenance,
  documentLabels,
  onOpen,
}: {
  model: ProLivingModel;
  summary: CaseSummaryModel;
  provenance: ProvenanceIndex | null;
  documentLabels: string[];
  onOpen: (spec: CaseSummaryPanelSpec) => void;
}) {
  return (
    <section className="sec" aria-label="Review first">
      <div>
        <h2>Review first</h2>
        <p className="sub">The three things in this record most likely to matter at the meeting.</p>
      </div>
      <div className="signals">
        {model.signals.map((signal, index) => (
          <article className="sig" key={`${signal.headline}-${index}`}>
            <div className="n">
              <span>
                {index + 1} of {model.signals.length}
              </span>
              <StateBadge state={signal.state} />
            </div>
            <div className="h">{signal.headline}</div>
            <div className="d">{signal.detail}</div>
            <div className="chips">
              {signal.searched && signal.gap ? (
                <SearchedEvidenceChip
                  gapId={signal.gap.id}
                  title={signal.gap.text}
                  lookedFor={signal.gap.lookedFor}
                  closestClaimId={signal.gap.closestClaimId}
                  documentLabels={documentLabels}
                  documentCount={summary.documentCount}
                  onOpen={onOpen}
                />
              ) : null}
              <ClaimEvidenceChips claimIds={signal.claimIds} provenance={provenance} onOpen={onOpen} />
            </div>
            <div className="q">{signal.question}</div>
          </article>
        ))}
      </div>
    </section>
  );
}

function PriorProposedSection({
  model,
  provenance,
  onOpen,
}: {
  model: ProLivingModel;
  provenance: ProvenanceIndex | null;
  onOpen: (spec: CaseSummaryPanelSpec) => void;
}) {
  return (
    <section className="sec" aria-label="Prior versus proposed">
      <div>
        <h2>Prior vs proposed</h2>
        <p className="sub">Compared by what each thing is, not by sentence. Identical values are reconfirmed, not changed.</p>
      </div>
      <div className="tbl" data-testid="case-summary-pro-table">
        <div className="row head">
          <span />
          <span>Prior</span>
          <span>Proposed</span>
          <span>State</span>
        </div>
        {model.compareRows.map((row, index) =>
          row.kind === "group" ? (
            <div className="row group" key={`g-${row.label}-${index}`}>
              {row.label}
            </div>
          ) : (
            <CompareTableRow key={`${row.label}-${index}`} row={row} model={model} provenance={provenance} onOpen={onOpen} />
          ),
        )}
      </div>
    </section>
  );
}

function CompareTableRow({
  row,
  model,
  provenance,
  onOpen,
}: {
  row: Extract<ProCompareRow, { kind: "row" }>;
  model: ProLivingModel;
  provenance: ProvenanceIndex | null;
  onOpen: (spec: CaseSummaryPanelSpec) => void;
}) {
  return (
    <div className="row">
      <div className="cell">
        <span className="lab">{row.label}</span>
      </div>
      <div className="cell pl">
        <CompareCell
          claimIds={row.priorClaimIds}
          model={model}
          provenance={provenance}
          onOpen={onOpen}
          empty={row.state === "added" ? "Not in Prior IEP" : row.why}
          flag={row.state === "notcompared"}
        />
      </div>
      <div className="cell pr">
        <CompareCell claimIds={row.propClaimIds} model={model} provenance={provenance} onOpen={onOpen} empty={row.why} />
      </div>
      <div className="cell">
        <StateBadge state={row.state} />
      </div>
    </div>
  );
}

function CompareCell({
  claimIds,
  model,
  provenance,
  onOpen,
  empty,
  flag,
}: {
  claimIds?: string[];
  model: ProLivingModel;
  provenance: ProvenanceIndex | null;
  onOpen: (spec: CaseSummaryPanelSpec) => void;
  empty?: string;
  flag?: boolean;
}) {
  if (!claimIds?.length) {
    return <span className={`none${flag ? " flag" : ""}`}>{empty ?? "—"}</span>;
  }
  const facts = claimIds.map((id) => model.factsByClaimId.get(id)).filter(Boolean) as ProTypedFact[];
  return (
    <>
      {facts.map((f) => (
        <div className="v" key={f.claimId}>
          {formatFactDisplay(f)}
          <small>
            {f.attr}
            {f.ctx ? ` · ${f.ctx}` : ""}
          </small>
        </div>
      ))}
      <div className="chips">
        {claimIds.length === 2 ? (
          <CheckedEvidenceChip claimIds={claimIds} title={facts[0]?.attr ?? "Compare"} provenance={provenance} onOpen={onOpen} />
        ) : (
          <ClaimEvidenceChips claimIds={claimIds} provenance={provenance} onOpen={onOpen} />
        )}
      </div>
    </>
  );
}

function ProOrfChart({ series }: { series: ProMeasureSeriesView }) {
  const pts = series.points
    .map((p) => {
      const match = p.valueText.match(/-?\d+(?:\.\d+)?/);
      const num = match ? Number(match[0]) : NaN;
      const date = p.dateLabel;
      const isoGuess = /^\d{4}-\d{2}/.test(date) ? date : null;
      return { p, num, iso: isoGuess };
    })
    .filter((row) => Number.isFinite(row.num));
  if (pts.length < 2) {
    return <p className="note">Not enough dated fluency measures in the record to show a trend yet.</p>;
  }
  const t0 = Date.parse("2023-09-01");
  const t1 = Date.parse("2026-12-01");
  const span = t1 - t0 || 1;
  const X = (label: string, index: number) => {
    if (/^\d{4}-\d{2}/.test(label)) {
      const t = Date.parse(label);
      if (Number.isFinite(t)) {
        return 40 + ((t - t0) / span) * 540;
      }
    }
    return 40 + (index / Math.max(pts.length - 1, 1)) * 540;
  };
  const values = pts.map((p) => p.num);
  const minV = Math.min(...values, 40);
  const maxV = Math.max(...values, 120);
  const Y = (v: number) => 150 - ((v - minV) / (maxV - minV || 1)) * 120;
  const path = pts.map((row, i) => `${i ? "L" : "M"}${X(row.p.dateLabel, i).toFixed(1)} ${Y(row.num).toFixed(1)}`).join(" ");
  const target = series.goalTarget ? Number(series.goalTarget.match(/-?\d+/)?.[0]) : null;

  return (
    <svg viewBox="0 0 600 180" width="100%" role="img" aria-label="Oral reading fluency trend">
      {target != null && Number.isFinite(target) ? (
        <>
          <line x1="40" x2="580" y1={Y(target)} y2={Y(target)} stroke="#34A853" strokeDasharray="4 4" />
          <text x="580" y={Y(target) - 6} textAnchor="end" fontSize="11" fill="#137333">
            Goal {target}
          </text>
        </>
      ) : null}
      <path d={path} fill="none" stroke="#4285F4" strokeWidth="2.5" />
      {pts.map((row, i) => (
        <g key={row.p.chip.factId ?? i}>
          <circle cx={X(row.p.dateLabel, i)} cy={Y(row.num)} r="5" fill="#fff" stroke="#4285F4" strokeWidth="2.5" />
          <text x={X(row.p.dateLabel, i)} y={Y(row.num) - 12} textAnchor="middle" fontSize="12" fill="#0D0D0D">
            {row.p.valueText}
          </text>
          <text x={X(row.p.dateLabel, i)} y="172" textAnchor="middle" fontSize="10.5" fill="#5F6368">
            {row.p.dateLabel}
          </text>
        </g>
      ))}
    </svg>
  );
}

function ProMeasuresSection({
  model,
  onOpen,
}: {
  model: ProViewModel;
  onOpen: (spec: CaseSummaryPanelSpec) => void;
}) {
  const fluency = model.measureSeries[0];
  return (
    <section className="sec" aria-label="Measures over time">
      <div>
        <h2>Measures over time</h2>
        <p className="sub">A score that moves is a trend, not a change. Shown against the goal it was measured for.</p>
      </div>
      <div className="two">
        <div className="box">
          <h3>{fluency?.title ?? "Oral reading fluency"}</h3>
          {fluency ? (
            <>
              <ProOrfChart series={fluency} />
              <div className="chips">
                {[...fluency.pointChips, ...(fluency.goalChip ? [fluency.goalChip] : [])].map((chip) => (
                  <ProChipButton key={chip.label} chip={chip} onOpen={onOpen} />
                ))}
              </div>
              {fluency.warning ? <div className="warnnote">{fluency.warning}</div> : null}
            </>
          ) : (
            <p className="note">No fluency trend captured in this record yet.</p>
          )}
        </div>
        <div className="box">
          <h3>Reevaluation results</h3>
          <div className="mt">
            {model.reevalRows.length ? (
              model.reevalRows.map((row) => (
                <MeasureRowPro key={row.id} row={row} onOpen={onOpen} />
              ))
            ) : (
              <p className="note">No reevaluation summary rows captured yet.</p>
            )}
          </div>
          <span className="note">Single results. Earlier records may not measure the same constructs.</span>
        </div>
      </div>
    </section>
  );
}

function ProRecordTimeline({
  entries,
  onOpen,
}: {
  entries: ProTimelineEntry[];
  onOpen: (spec: CaseSummaryPanelSpec) => void;
}) {
  return (
    <section className="box" aria-label="Record timeline">
      <h3>Record timeline</h3>
      <div className="tl">
        {entries.map((entry, index) => (
          <div key={`${entry.docId}-${index}`}>
            {entry.gapBefore ? (
              <div className="hole">
                <span />
                <span className="bar" />
                <span className="t">
                  {entry.gapBefore.months} months with no documents ({entry.gapBefore.fromLabel} –{" "}
                  {entry.gapBefore.toLabel})
                </span>
              </div>
            ) : null}
            <div className="ev">
              <span className="d">{entry.undated ? "Undated" : entry.date}</span>
              <span className="pt" style={entry.undated ? { background: "#BDC1C6" } : undefined} />
              <span className="t">
                {entry.title}
                <small>{entry.factCount ? `${entry.factCount} facts` : "no facts"}</small>
              </span>
              <div className="chips">
                <ProChipButton chip={entry.chip} onOpen={onOpen} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProReadingIntegrity({
  rows,
  onOpen,
}: {
  rows: ProCoverageRow[];
  onOpen: (spec: CaseSummaryPanelSpec) => void;
}) {
  return (
    <section className="box" aria-label="Reading integrity">
      <h3>What Hive read</h3>
      <div className="cov">
        <span className="h">Document</span>
        <span className="h n p">
          Pages
        </span>
        <span className="h n">Facts</span>
        <span className="h f">Check</span>
        {rows.flatMap((row) => {
          const flagColor =
            row.status === "empty"
              ? "#A50E0E"
              : row.status === "undated" || row.status === "partial"
                ? "#7A5200"
                : "#137333";
          return [
            <span key={`${row.docId}-doc`}>
              <ProChipButton chip={row.chip} onOpen={onOpen} />
            </span>,
            <span key={`${row.docId}-pages`} className="n p">
              {row.pages.length ? row.pages.join(", ") : "—"}
            </span>,
            <span key={`${row.docId}-count`} className="n">
              {row.factCount}
            </span>,
            <span key={`${row.docId}-flag`} className="f" style={{ color: flagColor }}>
              {row.statusLabel}
            </span>,
          ];
        })}
      </div>
      <span className="note">
        A comparison marked “Not compared” means Hive didn’t capture that part of a document — not that the document
        is missing.
      </span>
    </section>
  );
}

function fluencyChartNumber(val: string): number | null {
  const match = val.match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function OrfChart({ model }: { model: ProLivingModel }) {
  const pts = model.fluencySeries
    .filter((f) => f.asOf && /^\d{4}-\d{2}/.test(f.asOf))
    .map((f) => ({ fact: f, num: fluencyChartNumber(f.val) }))
    .filter((row): row is { fact: (typeof model.fluencySeries)[number]; num: number } => row.num != null);
  if (pts.length < 2) {
    return <p className="note">Not enough dated fluency measures in the record to show a trend yet.</p>;
  }
  const t0 = Date.parse("2023-09-01");
  const t1 = Date.parse("2026-12-01");
  const span = t1 - t0 || 1;
  const X = (d: string) => {
    const t = Date.parse(d);
    if (!Number.isFinite(t)) {
      return 40;
    }
    return 40 + ((t - t0) / span) * 540;
  };
  const values = pts.map((p) => p.num);
  const minV = Math.min(...values, 40);
  const maxV = Math.max(...values, 120);
  const Y = (v: number) => 150 - ((v - minV) / (maxV - minV || 1)) * 120;
  const path = pts
    .map((p, i) => `${i ? "L" : "M"}${X(p.fact.asOf!).toFixed(1)} ${Y(p.num).toFixed(1)}`)
    .join(" ");
  const target = model.fluencyGoal ? fluencyChartNumber(model.fluencyGoal.val) : null;

  return (
    <svg viewBox="0 0 600 180" width="100%" role="img" aria-label="Oral reading fluency trend">
      {target != null && !Number.isNaN(target) ? (
        <>
          <line x1="40" x2="580" y1={Y(target)} y2={Y(target)} stroke="#34A853" strokeDasharray="4 4" />
          <text x="580" y={Y(target) - 6} textAnchor="end" fontSize="11" fill="#137333">
            Goal {target}
          </text>
        </>
      ) : null}
      <path d={path} fill="none" stroke="#4285F4" strokeWidth="2.5" />
      {pts.map((p) => (
        <g key={p.fact.claimId}>
          <circle cx={X(p.fact.asOf!)} cy={Y(p.num)} r="5" fill="#fff" stroke="#4285F4" strokeWidth="2.5" />
          <text x={X(p.fact.asOf!)} y={Y(p.num) - 12} textAnchor="middle" fontSize="12" fill="#0D0D0D">
            {p.fact.val}
          </text>
          <text x={X(p.fact.asOf!)} y="172" textAnchor="middle" fontSize="10.5" fill="#5F6368">
            {monYear(p.fact.asOf!)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function MeasuresSection({
  model,
  provenance,
  onOpen,
}: {
  model: ProLivingModel;
  provenance: ProvenanceIndex | null;
  onOpen: (spec: CaseSummaryPanelSpec) => void;
}) {
  return (
    <section className="sec" aria-label="Measures over time">
      <div>
        <h2>Measures over time</h2>
        <p className="sub">A score that moves is a trend, not a change. Shown against the goal it was measured for.</p>
      </div>
      <div className="two">
        <div className="box">
          <h3>Oral reading fluency</h3>
          <OrfChart model={model} />
          <div className="chips">
            <ClaimEvidenceChips
              claimIds={[
                ...model.fluencySeries.map((f) => f.claimId),
                ...(model.fluencyGoal ? [model.fluencyGoal.claimId] : []),
              ]}
              provenance={provenance}
              onOpen={onOpen}
            />
          </div>
          {model.fluencyMeasureWarning ? <div className="warnnote">{model.fluencyMeasureWarning}</div> : null}
        </div>
        <div className="box">
          <h3>Reevaluation results</h3>
          <div className="mt">
            {model.reevalFacts.map((f) => (
              <MeasureRow key={f.claimId} fact={f} provenance={provenance} onOpen={onOpen} />
            ))}
          </div>
          <span className="note">Single results. Earlier records may not measure the same constructs.</span>
        </div>
      </div>
    </section>
  );
}

function MeasureRowPro({
  row,
  onOpen,
}: {
  row: { label: string; valueText: string; chip: { label: string; factId?: string } };
  onOpen: (spec: CaseSummaryPanelSpec) => void;
}) {
  return (
    <>
      <span>{row.label}</span>
      <span className="val">{row.valueText}</span>
      <div className="src">
        <ProChipButton chip={row.chip} onOpen={onOpen} />
      </div>
    </>
  );
}

function MeasureRow({
  fact,
  provenance,
  onOpen,
}: {
  fact: ProTypedFact;
  provenance: ProvenanceIndex | null;
  onOpen: (spec: CaseSummaryPanelSpec) => void;
}) {
  return (
    <>
      <span>{fact.attr}</span>
      <span className="val">{formatFactDisplay(fact)}</span>
      <div className="src">
        <SourceEvidenceChip claimId={fact.claimId} provenance={provenance} onOpen={onOpen} />
      </div>
    </>
  );
}

function RecordTimeline({
  model,
  provenance,
  onOpen,
}: {
  model: ProLivingModel;
  provenance: ProvenanceIndex | null;
  onOpen: (spec: CaseSummaryPanelSpec) => void;
}) {
  const factsByDoc = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of model.facts) {
      map.set(f.sourceDocumentId, (map.get(f.sourceDocumentId) ?? 0) + 1);
    }
    return map;
  }, [model.facts]);

  const datedEntries = model.timeline.filter((e) => e.date && !e.undated);
  return (
    <section className="box" aria-label="Record timeline">
      <h3>Record timeline</h3>
      <div className="tl">
        {model.timeline.map((entry, index) => {
          const prevDated = datedEntries.filter((e) => e.date! < (entry.date ?? "")).pop();
          const hole =
            entry.date &&
            prevDated?.date &&
            (Date.parse(entry.date) - Date.parse(prevDated.date)) / 2.628e9 > 13
              ? monthGapFromDates(prevDated.date, entry.date)
              : null;
          const doc = model.docs.find((d) => d.id === entry.docId);
          const count = factsByDoc.get(entry.docId) ?? 0;
          return (
            <div key={`${entry.docId}-${index}`}>
              {hole ? (
                <div className="hole">
                  <span />
                  <span className="bar" />
                  <span className="t">
                    {hole.months} months with no documents ({monYear(hole.from)} – {monYear(hole.to)})
                  </span>
                </div>
              ) : null}
              <div className="ev">
                <span className="d">{entry.undated ? "undated" : entry.date}</span>
                <span className="pt" style={entry.undated ? { background: "#BDC1C6" } : undefined} />
                <span className="t">
                  {doc?.role ?? "Document"}
                  <small>{count ? `${count} facts` : "no facts"}</small>
                </span>
                <div className="chips">
                  <DocumentEvidenceChips docId={entry.docId} model={model} provenance={provenance} onOpen={onOpen} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function monthGapFromDates(from: string, to: string) {
  return {
    months: Math.round((Date.parse(to) - Date.parse(from)) / 2.628e9),
    from,
    to,
  };
}

function ReadingIntegrity({
  model,
  provenance,
  onOpen,
}: {
  model: ProLivingModel;
  provenance: ProvenanceIndex | null;
  onOpen: (spec: CaseSummaryPanelSpec) => void;
}) {
  return (
    <section className="box" aria-label="Reading integrity">
      <h3>What Hive read</h3>
      <div className="cov">
        <span className="h">Document</span>
        <span className="h n p">
          Pages
        </span>
        <span className="h n">Facts</span>
        <span className="h f">Check</span>
        {model.integrity.flatMap((row) => {
          const doc = model.docs.find((d) => d.id === row.docId);
          if (!doc) {
            return [];
          }
          const flagColor =
            row.flagHtml === "empty"
              ? "#A50E0E"
              : row.flagHtml === "undated" || row.flagHtml === "partial"
                ? "#7A5200"
                : "#137333";
          return [
            <span key={`${row.docId}-doc`}>
              <DocumentEvidenceChips docId={row.docId} model={model} provenance={provenance} onOpen={onOpen} />
            </span>,
            <span key={`${row.docId}-pages`} className="n p">
              {row.pages.length ? row.pages.join(", ") : "—"}
            </span>,
            <span key={`${row.docId}-count`} className="n">
              {row.factCount}
            </span>,
            <span key={`${row.docId}-flag`} className="f" style={{ color: flagColor }}>
              {row.flagText}
            </span>,
          ];
        })}
      </div>
      <span className="note">
        A comparison marked “Not compared” means Hive didn’t capture that part of a document — not that the document
        lacks it.
      </span>
    </section>
  );
}

function exportJson(model: ProLivingModel) {
  downloadTextFile("hive-case.json", JSON.stringify(buildProLivingExportJson(model), null, 2), "application/json");
}

function exportCsv(model: ProLivingModel) {
  const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [["attribute", "value", "unit", "as_of", "document", "page"].join(",")];
  for (const f of model.facts) {
    lines.push([f.attr, f.val, f.unit ?? "", f.asOf ?? "", f.filename, f.page].map(quote).join(","));
  }
  downloadTextFile("hive-case.csv", lines.join("\n"), "text/csv");
}
