"use client";

import { useMemo, useState } from "react";

import type { StructureMap } from "@hiveforyou/shared/discover/structure-map";
import type { StudySourceDocumentRef } from "@hiveforyou/shared/canonical-study";

import { domainAccentColor, domainLabel } from "@/lib/case/domain-display";

export type SourceListItem = {
  logicalDocumentId: string;
  title: string;
  documentType: string;
  documentDate?: string;
  domainId: string;
  sourceDocumentId: string;
  sourceFilename?: string;
  pageStart: number;
  pageEnd?: number;
  recognitionStatus: string;
};

type SourcesDirectoryProps = {
  structureMap: StructureMap | null;
  sourceDocuments: StudySourceDocumentRef[];
  selectedDomainId: string | null;
  selectedLogicalId: string | null;
  onSelect: (logicalDocumentId: string) => void;
};

export function SourcesDirectory({
  structureMap,
  sourceDocuments,
  selectedDomainId,
  selectedLogicalId,
  onSelect,
}: SourcesDirectoryProps) {
  const [query, setQuery] = useState("");

  const items = useMemo(
    () => buildSourceList(structureMap, sourceDocuments),
    [structureMap, sourceDocuments],
  );

  const filtered = items.filter((item) => {
    if (selectedDomainId && item.domainId !== selectedDomainId) {
      return false;
    }
    if (!query.trim()) {
      return true;
    }
    const q = query.trim().toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      item.documentType.toLowerCase().includes(q) ||
      (item.sourceFilename?.toLowerCase().includes(q) ?? false)
    );
  });

  if (!structureMap?.logicalDocuments.length) {
    return (
      <p className="font-sans text-sm text-hive-text-muted" data-testid="sources-empty">
        Source documents will appear here once your collection structure is available.
      </p>
    );
  }

  return (
    <div className="space-y-4" data-testid="sources-directory">
      <label className="block">
        <span className="sr-only">Search sources</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search documents…"
          className="w-full rounded-hive-lg border border-hive-border bg-hive-surface px-3 py-2 font-sans text-sm text-hive-navy placeholder:text-hive-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hive-blue-muted"
        />
      </label>
      <ul className="grid gap-3 sm:grid-cols-2">
        {filtered.map((item) => (
          <li key={item.logicalDocumentId}>
            <button
              type="button"
              className={`w-full rounded-hive-xl border p-4 text-left shadow-hive transition-all hover:shadow-hive-md ${
                selectedLogicalId === item.logicalDocumentId
                  ? "border-hive-blue-muted bg-hive-soft-sky/40"
                  : "border-hive-border bg-hive-surface"
              }`}
              onClick={() => onSelect(item.logicalDocumentId)}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-sans text-sm font-medium text-hive-navy">{item.title}</p>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase"
                  style={{
                    backgroundColor: `${domainAccentColor(item.domainId)}22`,
                    color: domainAccentColor(item.domainId),
                  }}
                >
                  {domainLabel(item.domainId)}
                </span>
              </div>
              <p className="mt-1 font-sans text-xs text-hive-text-muted">{item.documentType}</p>
              {item.documentDate ? (
                <p className="mt-1 font-mono text-xs text-hive-text-muted">{item.documentDate}</p>
              ) : null}
              {item.sourceFilename ? (
                <p className="mt-2 truncate font-mono text-xs text-hive-blue">{item.sourceFilename}</p>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      {!filtered.length ? (
        <p className="font-sans text-sm text-hive-text-muted">No documents match your search.</p>
      ) : null}
    </div>
  );
}

export function buildSourceList(
  structureMap: StructureMap | null,
  sourceDocuments: StudySourceDocumentRef[],
): SourceListItem[] {
  if (!structureMap) {
    return [];
  }
  const sourceById = new Map(
    sourceDocuments
      .filter((doc) => doc.sourceDocumentId)
      .map((doc) => [doc.sourceDocumentId!, doc]),
  );

  return structureMap.logicalDocuments.map((logical) => {
    const source = sourceById.get(logical.sourceDocumentId);
    return {
      logicalDocumentId: logical.id,
      title: logical.title,
      documentType: logical.documentType,
      documentDate: logical.documentDate,
      domainId: logical.domainId,
      sourceDocumentId: logical.sourceDocumentId,
      sourceFilename: source?.originalFilename,
      pageStart: logical.pageStart,
      pageEnd: logical.pageEnd,
      recognitionStatus: logical.recognitionStatus,
    };
  });
}

export function SourceInspector({
  item,
  onClose,
}: {
  item: SourceListItem | null;
  onClose: () => void;
}) {
  if (!item) {
    return null;
  }

  return (
    <aside
      data-testid="source-inspector"
      className="rounded-hive-xl border border-hive-border bg-hive-surface p-5 shadow-hive-lg lg:w-96 lg:shrink-0"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-serif text-lg font-bold text-hive-navy">{item.title}</h3>
        <button
          type="button"
          className="font-sans text-xs font-bold text-hive-sage"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <dl className="mt-4 space-y-2 font-sans text-sm">
        <DtRow label="Type" value={item.documentType} />
        <DtRow label="Domain" value={domainLabel(item.domainId)} />
        <DtRow label="Status" value={item.recognitionStatus.replace(/_/g, " ")} />
        {item.documentDate ? <DtRow label="Date" value={item.documentDate} /> : null}
        <DtRow
          label="Pages"
          value={
            item.pageEnd && item.pageEnd !== item.pageStart
              ? `${item.pageStart}–${item.pageEnd}`
              : String(item.pageStart)
          }
        />
        {item.sourceFilename ? <DtRow label="File" value={item.sourceFilename} /> : null}
      </dl>
    </aside>
  );
}

function DtRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-hive-text-muted">{label}</dt>
      <dd className="text-hive-navy">{value}</dd>
    </div>
  );
}
