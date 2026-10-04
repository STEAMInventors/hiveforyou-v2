import { FileText } from "lucide-react";

import type { DocumentDiscoveryDocument } from "@/lib/document-discovery/types";

type QuestionDocumentReferenceProps = {
  documents: DocumentDiscoveryDocument[];
};

export function QuestionDocumentReference({
  documents,
}: QuestionDocumentReferenceProps) {
  if (!documents.length) {
    return null;
  }

  return (
    <ul className="flex flex-wrap gap-2" aria-label="Related documents">
      {documents.map((doc) => (
        <li key={doc.id}>
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-hive-md bg-hive-soft-sky/50 px-3 py-1.5 font-mono text-xs text-hive-blue">
            <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{doc.originalFilename}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
