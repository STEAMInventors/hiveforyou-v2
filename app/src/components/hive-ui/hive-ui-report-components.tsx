"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";

import type {
  CanonicalStudyReportClaimRef,
  CanonicalStudyReportFactLine,
} from "@hiveforyou/shared/canonical-study-report-projection";
import type { HiveUiProSectionKey } from "@hiveforyou/shared/hive-ui-tree";

import { CanonicalStudyReportEvidenceChip } from "@/components/hive-customer/CanonicalStudyReportEvidenceChip";

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

function FactLinePresentation({ fact }: { fact: CanonicalStudyReportFactLine }) {
  return (
    <li className="rounded-lg border border-customerHive-border bg-white px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-customerHive-on-surface">
            {fact.recordTypeId}.{fact.fieldId}
          </p>
          <p className="mt-1 text-sm text-customerHive-on-surface-variant">{fact.displayText}</p>
        </div>
        <span className="rounded-full bg-customerHive-surface-low px-2 py-0.5 text-xs text-customerHive-on-surface-muted">
          {assertionLabel(fact.assertionKind)}
        </span>
      </div>
      {fact.evidence.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {fact.evidence.map((chip, index) => (
            <CanonicalStudyReportEvidenceChip key={`${chip.claimRef.fieldKey}-${index}`} chip={chip} />
          ))}
        </div>
      ) : null}
    </li>
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

export const hiveUiReportComponentMap = {
  ReportRoot: ({ children }: { children?: ReactNode }) => (
    <div className="space-y-10" data-testid="hive-ui-report-root">
      {children}
    </div>
  ),
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
    const isFirstStorySection =
      projection.audience === "customer" &&
      !isImportant &&
      projection.body.storySections[0]?.id === element.props.sectionId;
    return (
      <section>
        {isFirstStorySection ? (
          <h2 className="mb-4 text-xl font-semibold text-customerHive-on-surface">Your story</h2>
        ) : null}
        {isImportant ? (
          <h2 className="mb-4 text-xl font-semibold text-customerHive-on-surface">{section.title}</h2>
        ) : null}
        <article className="rounded-xl border border-customerHive-border bg-customerHive-surface-lowest p-5">
          {!isImportant ? (
            <h3 className="text-lg font-semibold text-customerHive-on-surface">{section.title}</h3>
          ) : null}
          {section.facts.length === 0 && !isImportant ? (
            <p className="mt-2 text-sm text-customerHive-on-surface-muted">
              No verified quoted facts for this document in the canonical study.
            </p>
          ) : (
            <ul className={`space-y-3 ${isImportant ? "" : "mt-4"}`}>{children}</ul>
          )}
        </article>
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
        <tr className="border-t border-customerHive-border">
          <td className="px-3 py-2 align-top">{fact.entityId ?? "—"}</td>
          <td className="px-3 py-2 align-top">{fact.recordTypeId}</td>
          <td className="px-3 py-2 align-top">{fact.fieldId}</td>
          <td className="px-3 py-2 align-top">{fact.displayText}</td>
          <td className="px-3 py-2 align-top">{assertionLabel(fact.assertionKind)}</td>
        </tr>
      );
    }
    return <FactLinePresentation fact={fact} />;
  },
  ChangesSection: ({ children }: { children?: ReactNode }) => (
    <section>
      <h2 className="mb-4 text-xl font-semibold text-customerHive-on-surface">Changes</h2>
      <ul className="space-y-4">{children}</ul>
    </section>
  ),
  ChangePair: ({ element }: { element: { props: { relationId: string } } }) => {
    const projection = useHiveUiReportProjection();
    const change = resolveChangeByRelationId(projection, element.props.relationId);
    if (!change) {
      return null;
    }
    return (
      <li className="rounded-lg border border-customerHive-border bg-white p-4">
        <p className="text-sm font-medium text-customerHive-on-surface">
          {change.fieldId} changed ({change.entityId})
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <FactLinePresentation fact={change.left} />
          <FactLinePresentation fact={change.right} />
        </div>
      </li>
    );
  },
  SupportsSection: ({ children }: { children?: ReactNode }) => (
    <section>
      <h2 className="mb-4 text-xl font-semibold text-customerHive-on-surface">Supports & alignment</h2>
      <ul className="space-y-3">{children}</ul>
    </section>
  ),
  SupportPair: ({ element }: { element: { props: { relationId: string } } }) => {
    const projection = useHiveUiReportProjection();
    const row = resolveSupportByRelationId(projection, element.props.relationId);
    if (!row) {
      return null;
    }
    return (
      <li className="rounded-lg border border-customerHive-border bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-customerHive-on-surface-muted">
          {row.label}
        </p>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <FactLinePresentation fact={row.left} />
          <FactLinePresentation fact={row.right} />
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
      <section>
        <h2 className="mb-4 text-xl font-semibold text-customerHive-on-surface">Open questions</h2>
        <ul className="space-y-3">
          {questions.map((question) => (
            <li key={question.id} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-medium text-amber-950">{question.title}</p>
              <p className="mt-1 text-sm text-amber-900">{question.detail}</p>
            </li>
          ))}
        </ul>
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
    return <CanonicalStudyReportEvidenceChip chip={chip} />;
  },
  MeasurementCard: ({ element }: { element: { props: { seriesId: string } } }) => {
    const projection = useHiveUiReportProjection();
    const series = resolveMeasurementSeries(projection, element.props.seriesId);
    if (!series) {
      return null;
    }
    return (
      <li className="rounded-lg border border-customerHive-border bg-white px-3 py-2">
        <p className="text-sm font-medium text-customerHive-on-surface">
          {series.constructId} · {series.dimensionKey}
        </p>
        <p className="mt-1 text-xs text-customerHive-on-surface-muted">
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
    return (
      <section aria-label="Document timeline">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-customerHive-on-surface-muted">
          Timeline
        </h2>
        <ol className="flex flex-wrap gap-2">
          {sections.map((section) => (
            <li
              key={section.id}
              className="rounded-full border border-customerHive-border bg-customerHive-surface-low px-3 py-1 text-xs text-customerHive-on-surface"
            >
              {section.orderingDate ?? section.title}
            </li>
          ))}
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
    if (element.props.sectionKey === "entity_ledger") {
      return (
        <section>
          <h3 className="mb-3 text-lg font-semibold text-customerHive-on-surface">{title}</h3>
          <div className="overflow-x-auto rounded-xl border border-customerHive-border">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-customerHive-surface-low">
                <tr>
                  <th className="px-3 py-2">Entity</th>
                  <th className="px-3 py-2">Record</th>
                  <th className="px-3 py-2">Field</th>
                  <th className="px-3 py-2">Value</th>
                  <th className="px-3 py-2">Kind</th>
                </tr>
              </thead>
              <tbody>{children}</tbody>
            </table>
          </div>
        </section>
      );
    }
    return (
      <section>
        <h3 className="mb-3 text-lg font-semibold text-customerHive-on-surface">{title}</h3>
        <ul className="space-y-2">{children}</ul>
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
      <li className="rounded-lg border border-customerHive-border bg-white px-3 py-2">
        <p className="text-xs text-customerHive-on-surface-muted">
          {quote.recordTypeId}.{quote.fieldId} · {quote.sourceDocumentId} p.{quote.page}
        </p>
        <p className="mt-1 text-sm text-customerHive-on-surface">{quote.quote}</p>
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
      <li className="rounded-lg border border-customerHive-border bg-white px-3 py-2 text-sm">
        <span className="font-medium">{relation.label}</span>{" "}
        <span className="text-customerHive-on-surface-muted">
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
      <li className="rounded-lg border border-customerHive-border bg-white px-3 py-2 text-sm">
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
      <li className="rounded-lg border border-customerHive-border bg-white px-3 py-2 text-sm">
        <span className="font-medium">{row.outcome}</span> · {row.ruleId} — {row.message}
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
      <li className="rounded-lg border border-customerHive-border bg-white px-3 py-2 text-sm">
        <span className="font-medium">{row.status}</span> · {row.question} — {row.message}
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
      <li className="rounded-lg border border-customerHive-border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-customerHive-on-surface">{table.name}</h4>
            <p className="text-xs text-customerHive-on-surface-muted">
              {table.rows.length} rows · structured export table
            </p>
          </div>
          <button
            type="button"
            onClick={() => void copyExport()}
            disabled={!exportPermitted}
            className="rounded-lg border border-customerHive-border bg-white px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
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
