"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";

import type {
  CanonicalStudyReportClaimRef,
  CanonicalStudyReportFactLine,
} from "@hiveforyou/shared/canonical-study-report-projection";
import type {
  HiveUiLivingCaseChapterKey,
  HiveUiProSectionKey,
} from "@hiveforyou/shared/hive-ui-tree";

import { CanonicalStudyReportEvidenceChip } from "@/components/hive-customer/CanonicalStudyReportEvidenceChip";

import { LIVING_CASE_CHAPTER_LABELS } from "./living-case-chapter-labels";
import { useOptionalHiveUiReportEvidence } from "./hive-ui-report-evidence-context";
import { useHiveUiReportProjection } from "./hive-ui-report-projection-context";
import {
  resolveChangeByRelationId,
  resolveFactLineByClaimRef,
  resolveMeasurementSeries,
  resolveOpenQuestions,
  resolveProExportTable,
  resolveProFlag,
  resolveProOperativeView,
  resolveProQuotation,
  resolveProRelation,
  resolveProRequirement,
  resolveStorySection,
  resolveSupportByRelationId,
  resolveTimelineSections,
} from "./resolve-hive-ui-report-data";

function assertionLabel(kind: CanonicalStudyReportFactLine["assertionKind"]): string {
  switch (kind) {
    case "derived":
      return "Derived";
    case "classified":
      return "Classified (not verified quote)";
    case "unresolved":
      return "Unresolved";
    default:
      return "Verified quote";
  }
}

function LivingCaseEvidenceRow({
  fact,
}: {
  fact: CanonicalStudyReportFactLine;
}) {
  const evidenceContext = useOptionalHiveUiReportEvidence();
  if (fact.evidence.length === 0) {
    return null;
  }
  return (
    <div className="hir-evidence-row">
      {fact.evidence.map((chip, index) => {
        const citationNumber = evidenceContext?.citationNumberForChip(chip);
        return (
          <CanonicalStudyReportEvidenceChip
            key={`${chip.claimRef.fieldKey}-${index}`}
            chip={chip}
            variant="inverted"
            citationNumber={citationNumber}
            onSelect={evidenceContext ? () => evidenceContext.openEvidence(chip) : undefined}
          />
        );
      })}
    </div>
  );
}

function FactLinePresentation({
  fact,
  as: Tag = "li",
  variant = "card",
}: {
  fact: CanonicalStudyReportFactLine;
  as?: "li" | "div";
  variant?: "card" | "narrative";
}) {
  if (variant === "narrative") {
    return (
      <Tag
        className="hir-narrative-block"
        data-testid={`hive-ui-fact-${fact.claimRef.fieldKey}`}
      >
        <p className="hir-narrative-text">{fact.displayText}</p>
        <LivingCaseEvidenceRow fact={fact} />
      </Tag>
    );
  }
  return (
    <Tag className="hir-card hir-card--flat" data-testid={`hive-ui-fact-${fact.claimRef.fieldKey}`}>
      <p className="hir-fact-meta">
        {fact.recordTypeId}.{fact.fieldId} · {assertionLabel(fact.assertionKind)}
      </p>
      <p className="hir-fact-text">{fact.displayText}</p>
      <LivingCaseEvidenceRow fact={fact} />
    </Tag>
  );
}

function resolveFact(
  projection: ReturnType<typeof useHiveUiReportProjection>,
  claimRef: CanonicalStudyReportClaimRef,
) {
  return resolveFactLineByClaimRef(projection, claimRef);
}

const PRO_SECTION_TITLES: Record<HiveUiProSectionKey, string> = {
  export: "Structured export",
  entity_ledger: "Entity / field ledger",
  quotations: "Source quotations",
  relations: "Relationships",
  operative_views: "Operative views",
  requirements: "Requirements",
  flags: "Flags",
  measurement_series: "Measurement series",
};

const CHAPTER_ACCENT: Record<HiveUiLivingCaseChapterKey, string> = {
  understand: "hir-chapter--understand",
  discover: "hir-chapter--discover",
  act: "hir-chapter--act",
  verify: "hir-chapter--verify",
};

export const hiveUiReportComponentMap = {
  ReportRoot: ({ children }: { children?: ReactNode }) => (
    <div data-testid="hive-ui-report-root">{children}</div>
  ),
  LivingCaseChapter: ({
    element,
    children,
  }: {
    element: { props: { chapter: HiveUiLivingCaseChapterKey } };
    children?: ReactNode;
  }) => {
    const chapter = element.props.chapter;
    return (
      <section
        id={`living-case-chapter-${chapter}`}
        className={`hir-living-chapter ${CHAPTER_ACCENT[chapter]}`}
        data-testid={`living-case-chapter-${chapter}`}
        aria-labelledby={`living-case-chapter-heading-${chapter}`}
      >
        <h2
          id={`living-case-chapter-heading-${chapter}`}
          className="hir-living-chapter__title"
        >
          {LIVING_CASE_CHAPTER_LABELS[chapter]}
        </h2>
        <div className="hir-living-chapter__body">{children}</div>
      </section>
    );
  },
  ReportHeader: () => {
    const projection = useHiveUiReportProjection();
    if (projection.audience !== "customer") {
      return null;
    }
    const sections = projection.body.storySections;
    const docCount = new Set(sections.map((section) => section.sourceDocumentId)).size;
    const headline =
      sections[0]?.title?.trim() ||
      (docCount > 0 ? "Your case report" : "Case report");
    return (
      <header className="hir-living-header" data-testid="living-case-report-header">
        <div className="hir-living-header__marks" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <h1 className="hir-living-header__title">{headline}</h1>
        <p className="hir-living-header__meta">
          Customer report · Written from {docCount || "—"} document{docCount === 1 ? "" : "s"}
        </p>
      </header>
    );
  },
  BriefInsights: ({
    element,
  }: {
    element: { props: { claimRefs: CanonicalStudyReportClaimRef[] } };
  }) => {
    const projection = useHiveUiReportProjection();
    const facts = element.props.claimRefs
      .map((claimRef) => resolveFactLineByClaimRef(projection, claimRef))
      .filter((fact): fact is CanonicalStudyReportFactLine => fact != null);
    if (facts.length === 0) {
      return null;
    }
    const dots = ["hir-brief-dot--a", "hir-brief-dot--b", "hir-brief-dot--c"];
    return (
      <section className="hir-brief" data-testid="living-case-brief">
        <p className="hir-brief__label">In brief</p>
        <ul className="hir-brief__list">
          {facts.map((fact, index) => (
            <li key={fact.claimRef.fieldKey} className="hir-brief__item">
              <span className={`hir-brief-dot ${dots[index % dots.length]}`} aria-hidden="true" />
              <div className="hir-brief__content">
                <p className="hir-brief__text">{fact.displayText}</p>
                <LivingCaseEvidenceRow fact={fact} />
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  },
  ExpandableFacts: ({
    element,
    children,
  }: {
    element: { props: { toggleClaimRef?: CanonicalStudyReportClaimRef } };
    children?: ReactNode;
  }) => {
    const projection = useHiveUiReportProjection();
    const [open, setOpen] = useState(false);
    const toggleFact = element.props.toggleClaimRef
      ? resolveFactLineByClaimRef(projection, element.props.toggleClaimRef)
      : null;
    const toggleLabel = toggleFact?.displayText?.slice(0, 64) ?? "More detail";
    return (
      <div className="hir-expandable" data-testid="living-case-expandable">
        {toggleFact ? (
          <div className="hir-narrative-block">
            <p className="hir-narrative-text">{toggleFact.displayText}</p>
            <LivingCaseEvidenceRow fact={toggleFact} />
          </div>
        ) : null}
        <button
          type="button"
          className="hir-expandable__toggle"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide supporting detail" : toggleLabel}
        </button>
        {open ? <div className="hir-expandable__panel">{children}</div> : null}
      </div>
    );
  },
  StorySection: ({
    element,
    children,
  }: {
    element: { props: { sectionId: string } };
    children?: ReactNode;
  }) => {
    const projection = useHiveUiReportProjection();
    const section = resolveStorySection(projection, element.props.sectionId);
    if (!section) {
      return null;
    }
    const isImportant = element.props.sectionId === "__important_facts__";
    return (
      <section
        className="hir-story-section"
        data-testid={`hive-ui-section-${element.props.sectionId}`}
        aria-labelledby={`hive-ui-section-heading-${element.props.sectionId}`}
      >
        <h3
          id={`hive-ui-section-heading-${element.props.sectionId}`}
          className={isImportant ? "hir-section-title" : "hir-section-title hir-section-title--story"}
        >
          {section.title}
        </h3>
        {section.facts.length === 0 ? (
          <p className="text-sm text-[var(--hir-text-muted)]">
            No verified quoted facts for this document in the canonical study.
          </p>
        ) : (
          <ul className="hir-story-section__facts">{children}</ul>
        )}
      </section>
    );
  },
  FactRow: ({ element }: { element: { props: { claimRef: CanonicalStudyReportClaimRef } } }) => {
    const projection = useHiveUiReportProjection();
    const fact = resolveFact(projection, element.props.claimRef);
    if (!fact) {
      return null;
    }
    if (projection.audience === "pro") {
      return (
        <tr className="border-t border-[var(--hir-border)]" data-testid={`hive-ui-fact-${fact.claimRef.fieldKey}`}>
          <td className="px-3 py-2 align-top">{fact.entityId ?? "—"}</td>
          <td className="px-3 py-2 align-top">{fact.recordTypeId}</td>
          <td className="px-3 py-2 align-top">{fact.fieldId}</td>
          <td className="px-3 py-2 align-top">{fact.displayText}</td>
          <td className="px-3 py-2 align-top">{assertionLabel(fact.assertionKind)}</td>
        </tr>
      );
    }
    return <FactLinePresentation fact={fact} variant="narrative" />;
  },
  ChangesSection: ({ children }: { children?: ReactNode }) => (
    <section data-testid="hive-ui-section-changes">
      <h2 className="hir-section-title">Changes</h2>
      <ul className="m-0 flex list-none flex-col gap-4 p-0">{children}</ul>
    </section>
  ),
  ChangePair: ({ element }: { element: { props: { relationId: string } } }) => {
    const projection = useHiveUiReportProjection();
    const change = resolveChangeByRelationId(projection, element.props.relationId);
    if (!change) {
      return null;
    }
    return (
      <li className="hir-card" data-testid={`hive-ui-change-${element.props.relationId}`}>
        <p className="mb-3 text-sm font-semibold text-[var(--hir-text)]">
          {change.fieldId} changed ({change.entityId})
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <FactLinePresentation fact={change.left} as="div" />
          <FactLinePresentation fact={change.right} as="div" />
        </div>
      </li>
    );
  },
  SupportsSection: ({ children }: { children?: ReactNode }) => (
    <section data-testid="hive-ui-section-supports">
      <h2 className="hir-section-title">Supports & alignment</h2>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">{children}</ul>
    </section>
  ),
  SupportPair: ({ element }: { element: { props: { relationId: string } } }) => {
    const projection = useHiveUiReportProjection();
    const row = resolveSupportByRelationId(projection, element.props.relationId);
    if (!row) {
      return null;
    }
    return (
      <li className="hir-card" data-testid={`hive-ui-support-${element.props.relationId}`}>
        <p className="hir-fact-meta">{row.label}</p>
        <div className="grid gap-3 md:grid-cols-2">
          <FactLinePresentation fact={row.left} as="div" />
          <FactLinePresentation fact={row.right} as="div" />
        </div>
      </li>
    );
  },
  OpenQuestions: ({ element }: { element: { props: { questionIds: string[] } } }) => {
    const projection = useHiveUiReportProjection();
    const questions = resolveOpenQuestions(projection, element.props.questionIds);
    if (questions.length === 0) {
      return null;
    }
    return (
      <section
        className="hir-meeting-questions"
        data-testid="hive-ui-section-open-questions"
      >
        <h3 className="hir-section-title hir-section-title--story">Questions worth asking</h3>
        <p className="hir-meeting-questions__lead">
          You might bring these to your next meeting.
        </p>
        <ol className="hir-meeting-questions__list">
          {questions.map((question, index) => (
            <li key={question.id} className="hir-meeting-questions__item">
              <span className="hir-meeting-questions__index">{index + 1}</span>
              <div>
                <p className="hir-meeting-questions__title">{question.title}</p>
                {question.detail ? (
                  <p className="hir-meeting-questions__detail">{question.detail}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
        <p
          className="hir-meeting-questions__note"
          data-testid="living-case-save-questions-unavailable"
        >
          Saving your own questions for meeting prep is not available in this release yet.
        </p>
      </section>
    );
  },
  EvidenceChip: ({
    element,
  }: {
    element: { props: { claimRef: CanonicalStudyReportClaimRef; evidenceIndex?: number } };
  }) => {
    const projection = useHiveUiReportProjection();
    const fact = resolveFact(projection, element.props.claimRef);
    const chip = fact?.evidence[element.props.evidenceIndex ?? 0];
    if (!chip || fact?.assertionKind === "classified") {
      return null;
    }
    const evidenceContext = useOptionalHiveUiReportEvidence();
    const citationNumber = evidenceContext?.citationNumberForChip(chip);
    return (
      <CanonicalStudyReportEvidenceChip
        chip={chip}
        variant="inverted"
        citationNumber={citationNumber}
        onSelect={evidenceContext ? () => evidenceContext.openEvidence(chip) : undefined}
      />
    );
  },
  MeasurementCard: ({ element }: { element: { props: { seriesId: string } } }) => {
    const projection = useHiveUiReportProjection();
    const series = resolveMeasurementSeries(projection, element.props.seriesId);
    if (!series) {
      return null;
    }
    return (
      <li className="hir-card" data-testid={`hive-ui-measurement-${element.props.seriesId}`}>
        <p className="m-0 text-sm font-semibold text-[var(--hir-text)]">
          {series.constructId} · {series.dimensionKey}
        </p>
        <p className="mb-0 mt-1 text-xs text-[var(--hir-text-muted)]">
          {series.observationCount} observations
        </p>
      </li>
    );
  },
  Timeline: ({ element }: { element: { props: { storySectionIds: string[] } } }) => {
    const projection = useHiveUiReportProjection();
    const sections = resolveTimelineSections(projection, element.props.storySectionIds);
    if (sections.length === 0) {
      return null;
    }
    const [expandedId, setExpandedId] = useState<string | null>(null);
    return (
      <section
        className="hir-timeline-section"
        aria-label="Document timeline"
        data-testid="hive-ui-section-timeline"
      >
        <h3 className="hir-section-title hir-section-title--story">Connected timeline</h3>
        <ol className="hir-timeline-connected">
          {sections.map((section, index) => {
            const expanded = expandedId === section.id;
            return (
              <li key={section.id} className="hir-timeline-connected__item">
                <button
                  type="button"
                  className="hir-timeline-connected__trigger"
                  aria-expanded={expanded}
                  onClick={() => setExpandedId(expanded ? null : section.id)}
                >
                  <span className="hir-timeline-connected__index">{index + 1}</span>
                  <span className="hir-timeline-connected__label">
                    <span className="hir-timeline-connected__date">
                      {section.orderingDate ?? "Date not listed"}
                    </span>
                    <span className="hir-timeline-connected__title">{section.title}</span>
                  </span>
                </button>
                {expanded ? (
                  <div className="hir-timeline-connected__detail">
                    <p className="hir-timeline-connected__meta">
                      {section.documentTypeId ?? "Document"} · {section.sourceDocumentId}
                    </p>
                    <ul className="hir-story-section__facts">
                      {section.facts.map((fact) => (
                        <FactLinePresentation
                          key={fact.claimRef.fieldKey}
                          fact={fact}
                          variant="narrative"
                          as="li"
                        />
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>
    );
  },
  ProSection: ({
    element,
    children,
  }: {
    element: { props: { sectionKey: HiveUiProSectionKey } };
    children?: ReactNode;
  }) => {
    const title = PRO_SECTION_TITLES[element.props.sectionKey];
    const sectionKey = element.props.sectionKey;
    if (sectionKey === "entity_ledger") {
      return (
        <section data-testid={`hive-ui-pro-section-${sectionKey}`}>
          <h3 className="hir-section-title">{title}</h3>
          <div className="hir-table-wrap">
            <table className="hir-table">
              <thead>
                <tr>
                  <th>Entity</th>
                  <th>Record</th>
                  <th>Field</th>
                  <th>Value</th>
                  <th>Kind</th>
                </tr>
              </thead>
              <tbody>{children}</tbody>
            </table>
          </div>
        </section>
      );
    }
    return (
      <section data-testid={`hive-ui-pro-section-${sectionKey}`}>
        <h3 className="hir-section-title">{title}</h3>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">{children}</ul>
      </section>
    );
  },
  ProQuotationRow: ({ element }: { element: { props: { fieldKey: string } } }) => {
    const projection = useHiveUiReportProjection();
    const quote = resolveProQuotation(projection, element.props.fieldKey);
    if (!quote) {
      return null;
    }
    return (
      <li className="hir-card" data-testid={`hive-ui-pro-quote-${element.props.fieldKey}`}>
        <p className="hir-fact-meta">
          {quote.recordTypeId}.{quote.fieldId} · {quote.sourceDocumentId} p.{quote.page}
        </p>
        <p className="hir-fact-text">{quote.quote}</p>
      </li>
    );
  },
  ProRelationRow: ({ element }: { element: { props: { relationId: string } } }) => {
    const projection = useHiveUiReportProjection();
    const relation = resolveProRelation(projection, element.props.relationId);
    if (!relation) {
      return null;
    }
    return (
      <li className="hir-card text-sm" data-testid={`hive-ui-pro-relation-${element.props.relationId}`}>
        <span className="font-semibold">{relation.label}</span>{" "}
        <span className="text-[var(--hir-text-muted)]">
          {relation.fieldId} · {relation.leftFieldKey} ↔ {relation.rightFieldKey}
        </span>
      </li>
    );
  },
  ProOperativeViewRow: ({ element }: { element: { props: { viewId: string } } }) => {
    const projection = useHiveUiReportProjection();
    const view = resolveProOperativeView(projection, element.props.viewId);
    if (!view) {
      return null;
    }
    return (
      <li className="hir-card text-sm" data-testid={`hive-ui-pro-operative-${element.props.viewId}`}>
        {view.baseDocumentTypeId} · {view.status} · {view.recordCount} records
      </li>
    );
  },
  ProRequirementRow: ({ element }: { element: { props: { requirementId: string } } }) => {
    const projection = useHiveUiReportProjection();
    const row = resolveProRequirement(projection, element.props.requirementId);
    if (!row) {
      return null;
    }
    return (
      <li className="hir-card text-sm" data-testid={`hive-ui-pro-requirement-${element.props.requirementId}`}>
        <span className="font-semibold">{row.outcome}</span> · {row.ruleId} — {row.message}
      </li>
    );
  },
  ProFlagRow: ({ element }: { element: { props: { flagId: string } } }) => {
    const projection = useHiveUiReportProjection();
    const row = resolveProFlag(projection, element.props.flagId);
    if (!row) {
      return null;
    }
    return (
      <li className="hir-card text-sm" data-testid={`hive-ui-pro-flag-${element.props.flagId}`}>
        <span className="font-semibold">{row.status}</span> · {row.question} — {row.message}
      </li>
    );
  },
  ProExportBlock: ({ element }: { element: { props: { tableIndex: number } } }) => {
    const projection = useHiveUiReportProjection();
    const table = resolveProExportTable(projection, element.props.tableIndex);
    const exportPermitted = projection.presentationMode === "approved";
    const exportJson = useMemo(
      () => JSON.stringify(projection.audience === "pro" ? projection.body.exportTables : null, null, 2),
      [projection],
    );
    const [exportState, setExportState] = useState<"idle" | "copied">("idle");

    const copyExport = useCallback(async () => {
      if (!exportPermitted) {
        return;
      }
      try {
        await navigator.clipboard.writeText(exportJson);
        setExportState("copied");
        window.setTimeout(() => setExportState("idle"), 2000);
      } catch {
        setExportState("idle");
      }
    }, [exportJson, exportPermitted]);

    if (!table) {
      return null;
    }

    return (
      <li className="hir-card" data-testid={`hive-ui-pro-export-${element.props.tableIndex}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="m-0 text-sm font-semibold text-[var(--hir-text)]">{table.name}</h4>
            <p className="mb-0 mt-1 text-xs text-[var(--hir-text-muted)]">
              {table.rows.length} rows · structured export table
            </p>
          </div>
          <button
            type="button"
            onClick={() => void copyExport()}
            disabled={!exportPermitted}
            className="hir-btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
            title={
              exportPermitted
                ? "Copy structured export tables"
                : "Export disabled for internal preview until pack approval permits customer/pro reports."
            }
          >
            {exportState === "copied" ? "Copied" : "Copy export tables"}
          </button>
        </div>
      </li>
    );
  },
};
