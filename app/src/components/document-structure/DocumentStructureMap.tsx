"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import type {
  DocumentDiscoveryDocument,
  DocumentDiscoveryGroup,
  DocumentDiscoveryRelationship,
  MissingExpectedDocument,
} from "@/lib/document-discovery/types";

import { AmbiguousDocumentNode } from "./AmbiguousDocumentNode";
import { DocumentNode } from "./DocumentNode";
import { DocumentRelationship } from "./DocumentRelationship";
import { MissingDocumentNode } from "./MissingDocumentNode";

export type { DocumentStructureMapReveal } from "@/lib/document-discovery/map-reveal-types";

import type { DocumentStructureMapReveal } from "@/lib/document-discovery/map-reveal-types";

type DocumentStructureMapProps = {
  groups: DocumentDiscoveryGroup[];
  documents: DocumentDiscoveryDocument[];
  relationships: DocumentDiscoveryRelationship[];
  missingDocuments: MissingExpectedDocument[];
  reveal: DocumentStructureMapReveal;
  selectedDocumentId: string | null;
  selectedMissingId: string | null;
  onSelectDocument: (documentId: string) => void;
  onSelectMissing: (missingId: string) => void;
};

function sortBySequence<T extends { sequenceOrder?: number }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => (a.sequenceOrder ?? 999) - (b.sequenceOrder ?? 999),
  );
}

export function DocumentStructureMap({
  groups,
  documents,
  relationships,
  missingDocuments,
  reveal,
  selectedDocumentId,
  selectedMissingId,
  onSelectDocument,
  onSelectMissing,
}: DocumentStructureMapProps) {
  const sortedGroups = sortBySequence(groups);
  const relationshipLabels = new Map<string, string>();
  for (const rel of relationships) {
    if (rel.label) {
      relationshipLabels.set(rel.toDocumentId, rel.label);
    }
  }

  return (
    <div
      data-testid="document-structure-map"
      className="flex w-full flex-col gap-6 lg:gap-8"
    >
      {sortedGroups.map((group) => {
        const groupDocs = sortBySequence(
          documents.filter((doc) => doc.groupId === group.id),
        );
        const groupMissing = reveal.showMissing
          ? sortBySequence(
              missingDocuments.filter((item) => item.groupId === group.id),
            )
          : [];

        if (!groupDocs.length && !groupMissing.length) {
          return null;
        }

        return (
          <DocumentGroupSection
            key={group.id}
            group={group}
            documents={groupDocs}
            missing={groupMissing}
            reveal={reveal}
            relationshipLabels={relationshipLabels}
            selectedDocumentId={selectedDocumentId}
            selectedMissingId={selectedMissingId}
            onSelectDocument={onSelectDocument}
            onSelectMissing={onSelectMissing}
          />
        );
      })}
    </div>
  );
}

type DocumentGroupSectionProps = {
  group: DocumentDiscoveryGroup;
  documents: DocumentDiscoveryDocument[];
  missing: MissingExpectedDocument[];
  reveal: DocumentStructureMapReveal;
  relationshipLabels: Map<string, string>;
  selectedDocumentId: string | null;
  selectedMissingId: string | null;
  onSelectDocument: (documentId: string) => void;
  onSelectMissing: (missingId: string) => void;
};

export function DocumentGroupSection({
  group,
  documents,
  missing,
  reveal,
  relationshipLabels,
  selectedDocumentId,
  selectedMissingId,
  onSelectDocument,
  onSelectMissing,
}: DocumentGroupSectionProps) {
  const [collapsed, setCollapsed] = useState(group.defaultCollapsed ?? false);
  const visibleDocs = documents.filter((doc) =>
    reveal.visibleDocumentIds.has(doc.id),
  );
  const nodeCount = visibleDocs.length + (reveal.showMissing ? missing.length : 0);

  return (
    <section
      data-testid={`document-group-${group.id}`}
      className="rounded-hive-xl border border-hive-border bg-hive-surface/80 p-4 shadow-hive sm:p-5"
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg font-semibold text-hive-navy">
            {group.label}
          </h3>
          {group.description && (
            <p className="mt-1 font-sans text-sm text-hive-text-muted">
              {group.description}
            </p>
          )}
        </div>
        {nodeCount > 4 && (
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-1 rounded-hive-md px-2 py-1 font-sans text-xs font-medium text-hive-blue hover:bg-hive-soft-sky/60"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? "Show" : "Collapse"}
            <ChevronDown
              className={`h-4 w-4 transition-transform ${collapsed ? "-rotate-90" : ""}`}
              aria-hidden
            />
          </button>
        )}
      </header>

      {!collapsed && (
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-stretch">
          {visibleDocs.map((doc, index) => {
            const dimmed = !reveal.visibleDocumentIds.has(doc.id);
            const relLabel =
              reveal.showRelationships && index > 0
                ? relationshipLabels.get(doc.id)
                : undefined;
            const Node =
              doc.recognitionStatus === "ambiguous"
                ? AmbiguousDocumentNode
                : DocumentNode;

            return (
              <div
                key={doc.id}
                className="flex w-full flex-col gap-3 lg:w-auto lg:max-w-xs lg:flex-row lg:items-stretch"
              >
                {index > 0 && reveal.showRelationships && (
                  <DocumentRelationship label={relLabel} />
                )}
                <Node
                  document={doc}
                  selected={selectedDocumentId === doc.id}
                  dimmed={dimmed}
                  onSelect={() => onSelectDocument(doc.id)}
                />
              </div>
            );
          })}

          {reveal.showMissing &&
            missing.map((item) => (
              <div key={item.id} className="w-full lg:max-w-xs">
                <MissingDocumentNode
                  missing={item}
                  selected={selectedMissingId === item.id}
                  onSelect={() => onSelectMissing(item.id)}
                />
              </div>
            ))}
        </div>
      )}
    </section>
  );
}
