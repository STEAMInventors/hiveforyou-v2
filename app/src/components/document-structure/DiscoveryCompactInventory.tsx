"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { DocumentStructureMap } from "@/components/document-structure/DocumentStructureMap";
import { DocumentInspector } from "@/components/document-structure/DocumentInspector";
import type {
  DocumentDiscoveryDocument,
  DocumentDiscoveryDomainSection,
  DocumentDiscoveryGroup,
  DocumentDiscoveryResult,
  DocumentInspectorSelection,
  MissingExpectedDocument,
} from "@/lib/document-discovery/types";
import { customerRecognitionLabel } from "@/lib/document-discovery/types";

type DiscoveryCompactInventoryProps = {
  discovery: DocumentDiscoveryResult;
  selection: DocumentInspectorSelection;
  onSelect: (selection: DocumentInspectorSelection) => void;
  onCloseInspector: () => void;
};

function sortBySequence<T extends { sequenceOrder?: number }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => (a.sequenceOrder ?? 999) - (b.sequenceOrder ?? 999),
  );
}

function DocumentInventoryRow({
  document,
  selected,
  onSelect,
}: {
  document: DocumentDiscoveryDocument;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={`document-node-${document.id}`}
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        "grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1 rounded-hive-md border px-3 py-2 text-left sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_auto_auto]",
        selected
          ? "border-hive-sage bg-hive-soft-sky/50"
          : "border-hive-border bg-hive-surface hover:border-hive-blue/30 hover:bg-hive-soft-sky/20",
      ].join(" ")}
    >
      <span className="truncate font-sans text-sm font-medium text-hive-navy">
        {document.documentType}
      </span>
      <span className="truncate font-mono text-xs text-hive-text-muted">
        {document.documentDate ?? "—"}
      </span>
      <span className="rounded-full bg-hive-soft-sky px-2 py-0.5 font-sans text-[10px] font-medium text-hive-blue">
        {customerRecognitionLabel(document.recognitionStatus)}
      </span>
    </button>
  );
}

function MissingInventoryRow({
  missing,
  selected,
  onSelect,
}: {
  missing: MissingExpectedDocument;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      data-testid={`missing-document-node-${missing.id}`}
      className={[
        "rounded-hive-md border border-dashed border-amber-400/70 bg-amber-50/40 px-3 py-2",
        selected ? "ring-2 ring-amber-500/40 ring-offset-1" : "",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1 text-left sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_auto_auto]"
      >
        <span className="truncate font-sans text-sm font-medium text-hive-navy">
          {missing.expectedDocumentType}
        </span>
        <span className="truncate font-mono text-xs text-hive-text-muted">Expected</span>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 font-sans text-[10px] font-medium text-amber-800">
          not provided
        </span>
      </button>
      <div className="mt-2 flex flex-wrap gap-2 border-t border-amber-200/60 pt-2">
        {(["Upload", "I don't have it", "Not applicable"] as const).map((label) => (
          <button
            key={label}
            type="button"
            disabled
            title="Available in a later step"
            className="cursor-not-allowed rounded-hive-md border border-hive-border/80 bg-hive-surface/80 px-2 py-1 font-sans text-[11px] font-medium text-hive-text-muted opacity-70"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function InventoryGroup({
  group,
  documents,
  missing,
  selection,
  onSelect,
}: {
  group: DocumentDiscoveryGroup;
  documents: DocumentDiscoveryDocument[];
  missing: MissingExpectedDocument[];
  selection: DocumentInspectorSelection;
  onSelect: (selection: DocumentInspectorSelection) => void;
}) {
  if (!documents.length && !missing.length) {
    return null;
  }

  return (
    <section
      data-testid={`document-group-${group.id}`}
      className="rounded-hive-lg border border-hive-border/80 bg-hive-surface/90 p-3"
    >
      <h3 className="mb-2 font-serif text-base font-semibold text-hive-navy">{group.label}</h3>
      <ul className="flex flex-col gap-1.5">
        {documents.map((doc) => (
          <li key={doc.id}>
            <DocumentInventoryRow
              document={doc}
              selected={selection?.kind === "document" && selection.documentId === doc.id}
              onSelect={() => onSelect({ kind: "document", documentId: doc.id })}
            />
          </li>
        ))}
        {missing.map((item) => (
          <li key={item.id}>
            <MissingInventoryRow
              missing={item}
              selected={selection?.kind === "missing" && selection.missingDocumentId === item.id}
              onSelect={() => onSelect({ kind: "missing", missingDocumentId: item.id })}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function inventorySections(discovery: DocumentDiscoveryResult): DocumentDiscoveryDomainSection[] {
  if (discovery.domainSections && discovery.domainSections.length > 0) {
    return discovery.domainSections;
  }
  return [
    {
      domainId: "collection",
      domainLabel: discovery.domainLabel,
      groups: discovery.groups,
      documents: discovery.documents,
      missingDocuments: discovery.missingDocuments,
    },
  ];
}

function SectionInventory({
  section,
  selection,
  onSelect,
}: {
  section: DocumentDiscoveryDomainSection;
  selection: DocumentInspectorSelection;
  onSelect: (selection: DocumentInspectorSelection) => void;
}) {
  const sortedGroups = sortBySequence(section.groups);
  return (
    <section data-testid={`discovery-domain-section-${section.domainId}`} className="space-y-2">
      <header>
        <h2 className="font-serif text-lg font-semibold text-hive-navy">
          {section.domainLabel}
          <span className="font-sans text-sm font-medium text-hive-blue">
            {" "}
            · {section.documents.length} document{section.documents.length === 1 ? "" : "s"}
          </span>
        </h2>
        {section.missingDocuments.length > 0 ? (
          <p className="font-sans text-sm text-hive-text-muted">
            {section.missingDocuments.length} expected document
            {section.missingDocuments.length === 1 ? "" : "s"} not provided
          </p>
        ) : null}
      </header>
      <div className="grid gap-2 sm:grid-cols-2">
        {sortedGroups.map((group) => (
          <InventoryGroup
            key={`${section.domainId}:${group.id}`}
            group={group}
            documents={sortBySequence(
              section.documents.filter((doc) => doc.groupId === group.id),
            )}
            missing={sortBySequence(
              section.missingDocuments.filter((item) => item.groupId === group.id),
            )}
            selection={selection}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}

export function DiscoveryCompactInventory({
  discovery,
  selection,
  onSelect,
  onCloseInspector,
}: DiscoveryCompactInventoryProps) {
  const [timelineOpen, setTimelineOpen] = useState(false);
  const sections = inventorySections(discovery);

  const fullReveal = {
    visibleDocumentIds: new Set(discovery.documents.map((doc) => doc.id)),
    showMissing: true,
    showRelationships: true,
  };

  return (
    <div
      data-testid="discovery-compact-inventory"
      className="flex w-full flex-col gap-4 lg:flex-row lg:items-start"
    >
      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            data-testid="view-timeline-relationships"
            className="inline-flex items-center gap-1 rounded-hive-md px-2 py-1 font-sans text-xs font-semibold text-hive-blue hover:bg-hive-soft-sky/60"
            aria-expanded={timelineOpen}
            onClick={() => setTimelineOpen((open) => !open)}
          >
            View timeline &amp; relationships
            <ChevronDown
              className={`h-4 w-4 transition-transform ${timelineOpen ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
        </div>

        {sections.map((section) => (
          <SectionInventory
            key={section.domainId}
            section={section}
            selection={selection}
            onSelect={onSelect}
          />
        ))}

        {timelineOpen &&
          sections.map((section) => (
            <div
              key={`timeline-${section.domainId}`}
              className="rounded-hive-xl border border-hive-border bg-hive-soft-sky/30 p-4 sm:p-5"
            >
              <DocumentStructureMap
                groups={section.groups}
                documents={section.documents}
                relationships={discovery.relationships}
                missingDocuments={section.missingDocuments}
                reveal={fullReveal}
                selectedDocumentId={
                  selection?.kind === "document" ? selection.documentId : null
                }
                selectedMissingId={
                  selection?.kind === "missing" ? selection.missingDocumentId : null
                }
                onSelectDocument={(documentId) =>
                  onSelect({ kind: "document", documentId })
                }
                onSelectMissing={(missingDocumentId) =>
                  onSelect({ kind: "missing", missingDocumentId })
                }
              />
            </div>
          ))}
      </div>

      {selection && (
        <DocumentInspector
          selection={selection}
          documents={discovery.documents}
          relationships={discovery.relationships}
          missingDocuments={sections.flatMap((section) => section.missingDocuments)}
          onClose={onCloseInspector}
        />
      )}
    </div>
  );
}
