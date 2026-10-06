import "@hiveforyou/domain-packs";
import { classifyIepDocumentLocally } from "@hiveforyou/domain-packs";
import {
  decideIntakeDocumentIdentity,
  extractDocument,
  type IntakeExecutionDeps,
  type IntakeSourceDocument,
} from "@hiveforyou/intake";
import { recoverNormalizedDocument } from "@hiveforyou/intake/server-extraction";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { WorkerEnv } from "../env.js";
import { createSupabaseHiveGateway } from "../persistence/hive-gateway.js";
import { DocumentPagesStorage } from "./document-pages-storage.js";
import { WorkerIntakeRepository } from "../persistence/worker-intake-repository.js";
import { WorkerSourceDocumentRepository } from "./worker-source-documents.js";

export function buildWorkerIntakeDeps(
  supabase: SupabaseClient,
  env: WorkerEnv,
  userId: string,
): { deps: IntakeExecutionDeps; documents: WorkerSourceDocumentRepository } {
  const gateway = createSupabaseHiveGateway(supabase);
  const intake = new WorkerIntakeRepository(gateway, userId);
  const documents = new WorkerSourceDocumentRepository(gateway, userId);
  const documentPagesBucket = env.HIVE_DOCUMENT_PAGES_BUCKET?.trim() || "document-pages";
  const documentPagesStorage = new DocumentPagesStorage(gateway, documentPagesBucket);

  const deps: IntakeExecutionDeps = {
    runs: intake,
    identities: intake,
    extractions: intake,
    normalizedExtractions: intake,
    documentPages: {
      saveIfAbsent: (ownerId, sha256, documentPages) =>
        documentPagesStorage.saveIfAbsent(ownerId, sha256, documentPages),
    },
    loadDocuments: async ({
      userId: ownerId,
      caseId: ownerCaseId,
      sourceDocumentIds: ids,
    }: {
      userId: string;
      caseId: string;
      sourceDocumentIds: string[];
    }) => {
      const loaded: IntakeSourceDocument[] = [];
      for (const sourceDocumentId of ids) {
        const document = await documents.loadIntakeSource(ownerId, ownerCaseId, sourceDocumentId);
        if (document) {
          loaded.push(document);
        }
      }
      return loaded;
    },
    decide: (sample: string) =>
      decideIntakeDocumentIdentity(sample, { classifyLocally: classifyIepDocumentLocally }),
    sourceMetadata: async ({
      userId: ownerId,
      sourceDocumentIds: ids,
    }: {
      userId: string;
      sourceDocumentIds: string[];
    }) => {
      const metadata: Record<string, { filename: string; sourceHash: string }> = {};
      for (const sourceDocumentId of ids) {
        const record = await documents.getById(ownerId, sourceDocumentId);
        if (!record) {
          continue;
        }
        const rows = await gateway.selectWhere(
          "source_documents",
          { id: sourceDocumentId, user_id: ownerId },
          { limit: 1 },
        );
        const row = rows[0];
        metadata[sourceDocumentId] = {
          filename: row?.original_filename ? String(row.original_filename) : "Document",
          sourceHash: record.sha256,
        };
      }
      return metadata;
    },
    extract: (input) =>
      extractDocument(input, {
        recover: (recoverInput) => recoverNormalizedDocument(recoverInput),
        resolvePageRasterizer: async () => {
          const { createCanvasPageRasterizer } = await import(
            "@hiveforyou/intake-node/canvas-rasterize"
          );
          return createCanvasPageRasterizer();
        },
      }),
  };

  void env;
  return { deps, documents };
}
