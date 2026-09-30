"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { rememberClientCaseId } from "@/lib/canonical-study/map-start-request";
import {
  createStagedDocuments,
  type StagedDocument,
} from "@/lib/staged-documents";

type StagedDocumentsContextValue = {
  documents: StagedDocument[];
  /** Appends staged files and returns the newly created entries. */
  addDocuments: (files: File[]) => StagedDocument[];
  removeDocument: (id: string) => void;
  clearDocuments: () => void;
  adoptPersistedDocuments: (result: {
    caseId: string;
    documents: Array<{ stagedDocumentId: string; sourceDocumentId: string }>;
  }) => void;
};

const StagedDocumentsContext = createContext<
  StagedDocumentsContextValue | undefined
>(undefined);

export function StagedDocumentsProvider({
  children,
  initialDocuments = [],
}: {
  children: ReactNode;
  initialDocuments?: StagedDocument[];
}) {
  const [documents, setDocuments] = useState<StagedDocument[]>(initialDocuments);

  const addDocuments = useCallback((files: File[]) => {
    if (!files.length) {
      return [];
    }
    const created = createStagedDocuments(files);
    setDocuments((prev) => [...prev, ...created]);
    return created;
  }, []);

  const removeDocument = useCallback((id: string) => {
    setDocuments((prev) => prev.filter((doc) => doc.id !== id));
  }, []);

  const clearDocuments = useCallback(() => {
    setDocuments([]);
  }, []);

  const adoptPersistedDocuments = useCallback(
    (result: {
      caseId: string;
      documents: Array<{ stagedDocumentId: string; sourceDocumentId: string }>;
    }) => {
      rememberClientCaseId(result.caseId);
      const ids = new Map(
        result.documents.map((document) => [
          document.stagedDocumentId,
          document.sourceDocumentId,
        ]),
      );
      setDocuments((prev) =>
        prev.map((document) => {
          const sourceDocumentId = ids.get(document.id);
          if (!sourceDocumentId) {
            return document;
          }
          return { ...document, id: sourceDocumentId };
        }),
      );
    },
    [],
  );

  const value = useMemo(
    () => ({
      documents,
      addDocuments,
      removeDocument,
      clearDocuments,
      adoptPersistedDocuments,
    }),
    [documents, addDocuments, removeDocument, clearDocuments, adoptPersistedDocuments],
  );

  return (
    <StagedDocumentsContext.Provider value={value}>
      {children}
    </StagedDocumentsContext.Provider>
  );
}

export function useStagedDocuments(): StagedDocumentsContextValue {
  const ctx = useContext(StagedDocumentsContext);
  if (!ctx) {
    throw new Error("useStagedDocuments must be used within StagedDocumentsProvider");
  }
  return ctx;
}
