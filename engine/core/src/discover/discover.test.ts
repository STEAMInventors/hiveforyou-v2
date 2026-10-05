import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { loadBundledPromptContent } from "../prompts/load-prompt-content";

import { requireDiscoverPack } from "@hiveforyou/domain-packs";

const IEP_DISCOVER_PACK = requireDiscoverPack("iep");
import type { HiveDiscoverProposalV1, HiveDiscoverRun } from "@hiveforyou/shared/discover";
import { HIVE_DISCOVER_PROPOSAL_SCHEMA } from "@hiveforyou/shared/discover";

import {
  InMemorySourceDocumentRepository,
  type SourceDocumentRecord,
} from "../persistence/source-document-repository";
import { InMemorySourceDocumentStorage } from "../persistence/source-document-storage";
import { buildSourceDocumentStoragePath } from "../persistence/storage-path";
import {
  UnknownDiscoverPromptVersionError,
  loadDiscoverPrompt,
} from "../prompts/load-discover-prompt";
import { createDiscoverEngineFromEnv } from "./engine";
import { buildDiscoverIdempotencyKey } from "./fingerprint";
import { FixtureDiscoverEngine } from "./fixture-engine";
import {
  InMemoryDiscoverArtifactRepository,
  InMemoryDiscoverRunRepository,
  type DiscoverRunRepository,
} from "./repositories";
import { runDiscover } from "./run-discover";
import { validateDiscoveryProposal } from "./validate-discovery-proposal";

function sourceRecord(id: string, filename: string): SourceDocumentRecord {
  const now = new Date().toISOString();
  return {
    id,
    userId: "user-1",
    caseId: "case-1",
    intakeRunId: null,
    studyRunId: null,
    clientStagedId: id,
    originalFilename: filename,
    mimeType: "application/pdf",
    sizeBytes: 100,
    storageBucket: "case-documents",
    storagePath: buildSourceDocumentStoragePath({
      userId: "user-1",
      caseId: "case-1",
      sourceDocumentId: id,
      originalFilename: filename,
    }),
    sha256: "abc",
    status: "stored",
    createdAt: now,
    updatedAt: now,
  };
}

function baseProposal(
  overrides: Partial<HiveDiscoverProposalV1> = {},
): HiveDiscoverProposalV1 {
  return {
    schemaVersion: HIVE_DISCOVER_PROPOSAL_SCHEMA,
    domainResolution: {
      status: "RESOLVED",
      domainLabel: IEP_DISCOVER_PACK.domainLabel,
    },
    logicalDocuments: [
      {
        id: "doc-1",
        sourceDocumentId: "src-1",
        pageStart: 1,
        documentType: "Individualized Education Program",
        title: "IEP",
        familyRole: "Service plan",
        groupId: "planning",
        recognitionStatus: "recognized",
      },
    ],
    relationships: [],
    missingExpectedDocuments: [],
    ...overrides,
  };
}

describe("Engine 1 discover adapter", () => {
  it("loads discover-v1 prompt with explicit versioning and rejects latest", () => {
    const loaded = loadDiscoverPrompt("discover-v1");
    const content = loadBundledPromptContent("discover/discover-v1.md");
    expect(loaded.sha256).toBe(createHash("sha256").update(content).digest("hex"));
    expect(loaded.content).toContain("Model proposes. Pack defines. Code validates.");
    expect(() => loadDiscoverPrompt("latest")).toThrow(UnknownDiscoverPromptVersionError);
  });

  it("selects fixture mode only when explicitly configured", () => {
    const fixture = createDiscoverEngineFromEnv({ engine: "fixture" });
    expect(fixture.mode).toBe("fixture");
    expect(fixture.engine).toBeInstanceOf(FixtureDiscoverEngine);

    const openai = createDiscoverEngineFromEnv({
      engine: "openai",
      openaiApiKey: "test-key",
    });
    expect(openai.mode).toBe("openai");
    expect(openai.engine).not.toBeInstanceOf(FixtureDiscoverEngine);
  });

  it("does not silently fall back from openai to fixture when the provider fails", async () => {
    const failingOpenAI = createDiscoverEngineFromEnv(
      { engine: "openai", openaiApiKey: "test-key" },
      {
        createOpenAIEngine: () => ({
          discover: async () => {
            throw new Error("OPENAI_RESPONSE_FAILED:500");
          },
        }),
      },
    );
    expect(failingOpenAI.mode).toBe("openai");

    const prompt = loadDiscoverPrompt("discover-v1");
    const documents = new InMemorySourceDocumentRepository();
    const storage = new InMemorySourceDocumentStorage("user-1");
    const record = sourceRecord("src-1", "iep_2024.pdf");
    await documents.insert(record);
    await storage.upload({
      userId: "user-1",
      caseId: "case-1",
      sourceDocumentId: record.id,
      originalFilename: record.originalFilename,
      bytes: new Uint8Array([1, 2, 3]),
      bucket: "case-documents",
    });

    const outcome = await runDiscover(
      { caseId: "case-1", sourceDocumentIds: ["src-1"] },
      {
        sessionUserId: "user-1",
        engineConfig: failingOpenAI,
        prompt,
        documents,
        storage,
        runRepo: new InMemoryDiscoverRunRepository(),
        artifactRepo: new InMemoryDiscoverArtifactRepository(),
      },
    );
    expect(outcome.run.status).toBe("FAILED");
    expect(outcome.run.providerMode).toBe("openai");
    expect(outcome.run.errorCode).toBe("PROVIDER_ERROR");
    expect(outcome.documentDiscovery).toBeUndefined();
  });

  it("persists prompt version and sha256 on discover runs", async () => {
    const prompt = loadDiscoverPrompt("discover-v1");
    const documents = new InMemorySourceDocumentRepository();
    const storage = new InMemorySourceDocumentStorage("user-1");
    const record = sourceRecord("src-1", "iep_2024.pdf");
    await documents.insert(record);
    await storage.upload({
      userId: "user-1",
      caseId: "case-1",
      sourceDocumentId: record.id,
      originalFilename: record.originalFilename,
      bytes: new Uint8Array([1, 2, 3]),
      bucket: "case-documents",
    });
    const runRepo = new InMemoryDiscoverRunRepository();
    const artifactRepo = new InMemoryDiscoverArtifactRepository();

    const outcome = await runDiscover(
      { caseId: "case-1", sourceDocumentIds: ["src-1"] },
      {
        sessionUserId: "user-1",
        engineConfig: createDiscoverEngineFromEnv({ engine: "fixture" }),
        prompt,
        documents,
        storage,
        runRepo,
        artifactRepo,
      },
    );

    expect(outcome.run.promptId).toBe("discover");
    expect(outcome.run.promptVersion).toBe("v1");
    expect(outcome.run.promptSha256).toBe(prompt.sha256);
    expect(artifactRepo.artifacts[0]?.rawProposalJson).toBeTruthy();
    expect(artifactRepo.artifacts[0]?.validationResultJson).toBeTruthy();
    expect(artifactRepo.artifacts[0]?.discoveryResultJson).toBeTruthy();
  });

  it("accepts every registered IEP catalog document type in validated proposals", () => {
    for (const catalogEntry of IEP_DISCOVER_PACK.catalog) {
      const documentType = catalogEntry.documentType;

      const validation = validateDiscoveryProposal(
        baseProposal({
          logicalDocuments: [
            {
              id: "doc-1",
              sourceDocumentId: "src-1",
              pageStart: 1,
              documentType,
              title: catalogEntry.title,
              familyRole: catalogEntry.familyRole,
              groupId: catalogEntry.groupId,
              recognitionStatus: "recognized",
            },
          ],
        }),
        [{ sourceDocumentId: "src-1", originalFilename: "l001.pdf", sizeBytes: 1 }],
      );
      expect(validation.ok, documentType).toBe(true);
    }
  });

  it("rejects invalid vocabulary", () => {
    const validation = validateDiscoveryProposal(
      baseProposal({
        logicalDocuments: [
          {
            id: "doc-1",
            sourceDocumentId: "src-1",
            pageStart: 1,
            documentType: "Not a real document type",
            title: "Bad",
            familyRole: "Service plan",
            groupId: "planning",
            recognitionStatus: "recognized",
          },
        ],
      }),
      [{ sourceDocumentId: "src-1", originalFilename: "iep.pdf", sizeBytes: 1 }],
    );
    expect(validation.ok).toBe(false);
    expect(validation.issues.some((issue) => issue.code === "UNKNOWN_VOCABULARY")).toBe(
      true,
    );
  });

  it("rejects missing provenance", () => {
    const validation = validateDiscoveryProposal(
      baseProposal({
        logicalDocuments: [
          {
            id: "doc-1",
            sourceDocumentId: "src-1",
            pageStart: 0,
            documentType: "Individualized Education Program",
            title: "IEP",
            familyRole: "Service plan",
            groupId: "planning",
            recognitionStatus: "recognized",
          },
        ],
      }),
      [{ sourceDocumentId: "src-1", originalFilename: "iep.pdf", sizeBytes: 1 }],
    );
    expect(validation.ok).toBe(false);
    expect(validation.issues.some((issue) => issue.code === "MISSING_PROVENANCE")).toBe(
      true,
    );
  });

  it("preserves AMBIGUOUS domain resolution as review threshold", async () => {
    const prompt = loadDiscoverPrompt("discover-v1");
    const proposal = baseProposal({
      domainResolution: {
        status: "AMBIGUOUS",
        domainLabel: IEP_DISCOVER_PACK.domainLabel,
      },
    });
    const engineConfig = createDiscoverEngineFromEnv(
      { engine: "openai", openaiApiKey: "key" },
      {
        createOpenAIEngine: () => ({
          discover: async () => proposal,
        }),
      },
    );
    const documents = new InMemorySourceDocumentRepository();
    const storage = new InMemorySourceDocumentStorage("user-1");
    const record = sourceRecord("src-1", "iep_2024.pdf");
    await documents.insert(record);
    await storage.upload({
      userId: "user-1",
      caseId: "case-1",
      sourceDocumentId: record.id,
      originalFilename: record.originalFilename,
      bytes: new Uint8Array([1]),
      bucket: "case-documents",
    });

    const outcome = await runDiscover(
      { caseId: "case-1", sourceDocumentIds: ["src-1"] },
      {
        sessionUserId: "user-1",
        engineConfig,
        prompt,
        documents,
        storage,
        runRepo: new InMemoryDiscoverRunRepository(),
        artifactRepo: new InMemoryDiscoverArtifactRepository(),
      },
    );

    expect(outcome.run.status).toBe("NEEDS_REVIEW");
    expect(outcome.validationResult?.preservedDomainResolutionStatus).toBe("AMBIGUOUS");
    expect(outcome.documentDiscovery?.domainResolutionStatus).toBe("provisional");
  });

  it("preserves MULTI_DOMAIN domain resolution as review threshold", async () => {
    const prompt = loadDiscoverPrompt("discover-v1");
    const proposal = baseProposal({
      domainResolution: {
        status: "MULTI_DOMAIN",
        domainLabel: "Unknown label",
        candidateDomainLabels: [IEP_DISCOVER_PACK.domainLabel],
      },
    });
    const engineConfig = createDiscoverEngineFromEnv(
      { engine: "openai", openaiApiKey: "key" },
      {
        createOpenAIEngine: () => ({
          discover: async () => proposal,
        }),
      },
    );
    const documents = new InMemorySourceDocumentRepository();
    const storage = new InMemorySourceDocumentStorage("user-1");
    const record = sourceRecord("src-1", "iep_2024.pdf");
    await documents.insert(record);
    await storage.upload({
      userId: "user-1",
      caseId: "case-1",
      sourceDocumentId: record.id,
      originalFilename: record.originalFilename,
      bytes: new Uint8Array([1]),
      bucket: "case-documents",
    });

    const outcome = await runDiscover(
      { caseId: "case-1", sourceDocumentIds: ["src-1"] },
      {
        sessionUserId: "user-1",
        engineConfig,
        prompt,
        documents,
        storage,
        runRepo: new InMemoryDiscoverRunRepository(),
        artifactRepo: new InMemoryDiscoverArtifactRepository(),
      },
    );

    expect(outcome.run.status).toBe("NEEDS_REVIEW");
    expect(outcome.validationResult?.preservedDomainResolutionStatus).toBe("MULTI_DOMAIN");
  });

  it("fails closed on malformed provider responses", async () => {
    const engineConfig = createDiscoverEngineFromEnv(
      { engine: "openai", openaiApiKey: "key" },
      {
        createOpenAIEngine: () => ({
          discover: async () => {
            throw new Error("MALFORMED_PROPOSAL");
          },
        }),
      },
    );
    const prompt = loadDiscoverPrompt("discover-v1");
    const documents = new InMemorySourceDocumentRepository();
    const storage = new InMemorySourceDocumentStorage("user-1");
    const record = sourceRecord("src-1", "iep_2024.pdf");
    await documents.insert(record);
    await storage.upload({
      userId: "user-1",
      caseId: "case-1",
      sourceDocumentId: record.id,
      originalFilename: record.originalFilename,
      bytes: new Uint8Array([1]),
      bucket: "case-documents",
    });

    const outcome = await runDiscover(
      { caseId: "case-1", sourceDocumentIds: ["src-1"] },
      {
        sessionUserId: "user-1",
        engineConfig,
        prompt,
        documents,
        storage,
        runRepo: new InMemoryDiscoverRunRepository(),
        artifactRepo: new InMemoryDiscoverArtifactRepository(),
      },
    );

    expect(outcome.run.status).toBe("FAILED");
    expect(outcome.run.errorCode).toBe("MALFORMED_PROPOSAL");
  });

  it("writes discover artifacts with the canonical run id after save canonicalizes away a stale client id", async () => {
    const canonicalRunId = "11111111-1111-4111-8111-111111111111";
    const staleClientRunId = "22222222-2222-4222-8222-222222222222";

    class StaleReturnDiscoverRunRepository
      extends InMemoryDiscoverRunRepository
      implements DiscoverRunRepository
    {
      override async save(run: HiveDiscoverRun): Promise<HiveDiscoverRun> {
        const persisted = await super.save(run);
        return { ...persisted, discoverRunId: run.discoverRunId };
      }
    }

    const prompt = loadDiscoverPrompt("discover-v1");
    const documents = new InMemorySourceDocumentRepository();
    const storage = new InMemorySourceDocumentStorage("user-1");
    const record = sourceRecord("src-1", "iep_2024.pdf");
    await documents.insert(record);
    await storage.upload({
      userId: "user-1",
      caseId: "case-1",
      sourceDocumentId: record.id,
      originalFilename: record.originalFilename,
      bytes: new Uint8Array([1]),
      bucket: "case-documents",
    });

    const runRepo = new StaleReturnDiscoverRunRepository();
    const artifactRepo = new InMemoryDiscoverArtifactRepository();
    const idempotencyKey = buildDiscoverIdempotencyKey("case-1", ["src-1"]);
    await runRepo.save({
      discoverRunId: canonicalRunId,
      caseId: "case-1",
      idempotencyKey,
      providerId: "openai",
      providerMode: "fixture",
      promptId: prompt.id,
      promptVersion: prompt.version,
      promptSha256: prompt.sha256,
      domainPackId: "unknown",
      domainPackVersion: "unknown",
      startedAt: new Date().toISOString(),
      status: "RUNNING",
    });

    const outcome = await runDiscover(
      { caseId: "case-1", sourceDocumentIds: ["src-1"] },
      {
        sessionUserId: "user-1",
        engineConfig: createDiscoverEngineFromEnv({ engine: "fixture" }),
        prompt,
        documents,
        storage,
        runRepo,
        artifactRepo,
        generateDiscoverRunId: () => staleClientRunId,
      },
    );

    expect(outcome.run.discoverRunId).toBe(canonicalRunId);
    expect(outcome.run.discoverRunId).not.toBe(staleClientRunId);
    expect(artifactRepo.artifacts).toHaveLength(1);
    expect(artifactRepo.artifacts[0]?.discoverRunId).toBe(canonicalRunId);
    expect(await runRepo.getByDiscoverRunId(staleClientRunId)).toBeNull();
  });

  it("retries the same discover request on a failed run without a new run id", async () => {
    const prompt = loadDiscoverPrompt("discover-v1");
    const documents = new InMemorySourceDocumentRepository();
    const storage = new InMemorySourceDocumentStorage("user-1");
    const record = sourceRecord("src-1", "iep_2024.pdf");
    await documents.insert(record);
    await storage.upload({
      userId: "user-1",
      caseId: "case-1",
      sourceDocumentId: record.id,
      originalFilename: record.originalFilename,
      bytes: new Uint8Array([1]),
      bucket: "case-documents",
    });

    const runRepo = new InMemoryDiscoverRunRepository();
    const artifactRepo = new InMemoryDiscoverArtifactRepository();
    const request = { caseId: "case-1", sourceDocumentIds: ["src-1"] as string[] };
    const baseDeps = {
      sessionUserId: "user-1",
      prompt,
      documents,
      storage,
      runRepo,
      artifactRepo,
    };

    const failed = await runDiscover(request, {
      ...baseDeps,
      engineConfig: createDiscoverEngineFromEnv(
        { engine: "openai", openaiApiKey: "key" },
        {
          createOpenAIEngine: () => ({
            discover: async () => {
              throw new Error("MALFORMED_PROPOSAL");
            },
          }),
        },
      ),
    });
    expect(failed.run.status).toBe("FAILED");

    const retried = await runDiscover(request, {
      ...baseDeps,
      engineConfig: createDiscoverEngineFromEnv({ engine: "fixture" }),
    });

    expect(retried.run.discoverRunId).toBe(failed.run.discoverRunId);
    expect(retried.run.status).toBe("SUCCEEDED");
    expect(await runRepo.getByIdempotencyKey("case-1", failed.run.idempotencyKey)).toMatchObject({
      discoverRunId: failed.run.discoverRunId,
      status: "SUCCEEDED",
    });
  });

  it("keeps fixture mode behavior stable for known filenames", async () => {
    const prompt = loadDiscoverPrompt("discover-v1");
    const documents = new InMemorySourceDocumentRepository();
    const storage = new InMemorySourceDocumentStorage("user-1");
    const record = sourceRecord("src-1", "iep_2024.pdf");
    await documents.insert(record);
    await storage.upload({
      userId: "user-1",
      caseId: "case-1",
      sourceDocumentId: record.id,
      originalFilename: record.originalFilename,
      bytes: new Uint8Array([1]),
      bucket: "case-documents",
    });

    const outcome = await runDiscover(
      { caseId: "case-1", sourceDocumentIds: ["src-1"] },
      {
        sessionUserId: "user-1",
        engineConfig: createDiscoverEngineFromEnv({ engine: "fixture" }),
        prompt,
        documents,
        storage,
        runRepo: new InMemoryDiscoverRunRepository(),
        artifactRepo: new InMemoryDiscoverArtifactRepository(),
      },
    );

    expect(outcome.run.providerMode).toBe("fixture");
    expect(outcome.documentDiscovery?.documents[0]?.documentType).toContain(
      "Individualized Education Program",
    );
    expect(outcome.documentDiscovery?.missingDocuments.length).toBeGreaterThan(0);
  });
});
