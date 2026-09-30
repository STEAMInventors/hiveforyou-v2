import { X } from "lucide-react";

import { formatFileSize } from "@/lib/format-file-metadata";
import type {
  DocumentDiscoveryDocument,
  DocumentDiscoveryRelationship,
  DocumentInspectorSelection,
  MissingExpectedDocument,
} from "@/lib/document-discovery/types";

type DocumentInspectorProps = {
  selection: DocumentInspectorSelection;
  documents: DocumentDiscoveryDocument[];
  relationships: DocumentDiscoveryRelationship[];
  missingDocuments: MissingExpectedDocument[];
  onClose: () => void;
};

export function DocumentInspector({
  selection,
  documents,
  relationships,
  missingDocuments,
  onClose,
}: DocumentInspectorProps) {
  if (!selection) {
    return null;
  }

  if (selection.kind === "missing") {
    const missing = missingDocuments.find(
      (item) => item.id === selection.missingDocumentId,
    );
    if (!missing) {
      return null;
    }

    return (
      <aside
        data-testid="document-inspector"
        className="w-full shrink-0 rounded-hive-xl border border-hive-border bg-hive-surface p-5 shadow-hive-lg lg:w-96"
        aria-label="Expected document details"
      >
        <InspectorHeader title="Expected document" onClose={onClose} />
        <dl className="mt-4 space-y-3 font-sans text-sm">
          <InspectorRow label="Expected type" value={missing.expectedDocumentType} />
          <InspectorRow label="Document role" value={missing.familyRole} />
          <InspectorRow label="Status" value="Not provided" />
          <InspectorRow label="Why expected" value={missing.reasonExpected} />
        </dl>
        <p className="mt-4 font-sans text-sm text-hive-text-muted">
          Hive will ask about this document in the next step.
        </p>
      </aside>
    );
  }

  const document = documents.find((doc) => doc.id === selection.documentId);
  if (!document) {
    return null;
  }

  const related = relationships
    .filter(
      (rel) =>
        rel.fromDocumentId === document.id || rel.toDocumentId === document.id,
    )
    .map((rel) => {
      const otherId =
        rel.fromDocumentId === document.id
          ? rel.toDocumentId
          : rel.fromDocumentId;
      const other = documents.find((doc) => doc.id === otherId);
      if (!other) {
        return null;
      }
      return rel.label
        ? `${rel.label}: ${other.title}`
        : `${other.documentType} — ${other.title}`;
    })
    .filter((line): line is string => line !== null);

  const recognitionLabel =
    document.recognitionStatus === "recognized"
      ? "Recognized"
      : document.recognitionStatus === "ambiguous"
        ? "Ambiguous — needs clarification"
        : document.recognitionStatus === "proposed_type"
          ? "Not a standard type"
          : "Unrecognized";

  return (
    <aside
      data-testid="document-inspector"
      className="w-full shrink-0 rounded-hive-xl border border-hive-border bg-hive-surface p-5 shadow-hive-lg lg:w-96"
      aria-label="Document details"
    >
      <InspectorHeader title="Document" onClose={onClose} />
      <dl className="mt-4 space-y-3 font-sans text-sm">
        <InspectorRow label="Document type" value={document.documentType} />
        <InspectorRow label="Title" value={document.title} />
        <InspectorRow label="Document role" value={document.familyRole} />
        <InspectorRow label="Original filename" value={document.originalFilename} />
        <InspectorRow label="File size" value={formatFileSize(document.sizeBytes)} />
        {document.documentDate && (
          <InspectorRow label="Document date" value={document.documentDate} />
        )}
        {document.pageCount != null && (
          <InspectorRow label="Pages" value={String(document.pageCount)} />
        )}
        <InspectorRow label="Recognition" value={recognitionLabel} />
      </dl>
      {related.length > 0 && (
        <div className="mt-4">
          <h4 className="font-sans text-xs font-semibold uppercase tracking-wide text-hive-text-muted">
            Relationships
          </h4>
          <ul className="mt-2 list-disc space-y-1 pl-5 font-sans text-sm text-hive-navy">
            {related.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}

function InspectorHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <h2 className="font-serif text-xl font-semibold text-hive-navy">{title}</h2>
      <button
        type="button"
        onClick={onClose}
        className="rounded-hive-md p-1 text-hive-text-muted hover:bg-hive-soft-sky/60 hover:text-hive-navy"
        aria-label="Close inspector"
      >
        <X className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}

function InspectorRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-hive-text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 text-hive-navy">{value}</dd>
    </div>
  );
}
