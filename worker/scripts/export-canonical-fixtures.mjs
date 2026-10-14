import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { orderSourceDocumentIdsForEngine1 } from "@hiveforyou/core";
import {
  canonicalStudyArtifactPath,
  documentPagesStoragePath,
  readerDocumentExtractionStudyRunManifestPath,
} from "@hiveforyou/shared/hive-artifact-paths";
import { parseReaderDocumentExtractionEnvelope } from "@hiveforyou/shared/reader-document-extraction";

const REPO_ROOT = process.cwd();
const BUCKET = process.env.HIVE_DOCUMENT_PAGES_BUCKET?.trim() || "document-pages";

function parseArgs(argv) {
  let studyRunId = null;
  let out = null;
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--studyRunId") {
      studyRunId = argv[++i] ?? null;
    } else if (arg === "--out") {
      out = argv[++i] ?? null;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!studyRunId?.trim()) {
    throw new Error("Missing required --studyRunId");
  }
  if (!out?.trim()) {
    throw new Error("Missing required --out");
  }
  return { studyRunId: studyRunId.trim(), outDir: resolve(REPO_ROOT, out.trim()) };
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => sortKeysDeep(entry));
  }
  if (value && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeysDeep(value[key]);
    }
    return sorted;
  }
  return value;
}

function writeCanonicalJson(path, value) {
  writeFileSync(path, `${JSON.stringify(sortKeysDeep(value), null, 2)}\n`, "utf8");
}

function gw(client) {
  return {
    async selectWhere(table, where, limit) {
      let q = client.schema("hive").from(table).select("*");
      for (const [k, v] of Object.entries(where)) {
        q = q.eq(k, v);
      }
      if (limit) {
        q = q.limit(limit);
      }
      const { data, error } = await q;
      if (error) {
        throw new Error(error.message);
      }
      return data ?? [];
    },
    async download(path) {
      const { data, error } = await client.storage.from(BUCKET).download(path);
      if (error) {
        throw new Error(`${path}: ${error.message}`);
      }
      return new Uint8Array(await data.arrayBuffer());
    },
  };
}

async function downloadJson(g, objectKey) {
  const bytes = await g.download(objectKey);
  return JSON.parse(new TextDecoder().decode(bytes));
}

function readDocumentTypeId(envelope) {
  const raw = envelope.parsedModelJson?.documentTypeId;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

async function main() {
  const { studyRunId, outDir } = parseArgs(process.argv);
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const client = createClient(url, key);
  const g = gw(client);

  const run = (await g.selectWhere("study_runs", { id: studyRunId }, 1))[0];
  if (!run) {
    throw new Error(`study run missing: ${studyRunId}`);
  }
  const userId = String(run.user_id);
  const caseId = String(run.case_id);

  const ctxRow = (await g.selectWhere("study_contexts", { study_run_id: studyRunId }, 1))[0];
  const ctx = ctxRow?.context_json ?? {};
  const logicalDocuments = ctx.structureMap?.logicalDocuments ?? ctx.logicalDocuments ?? [];

  const studyRunManifestPath = readerDocumentExtractionStudyRunManifestPath(userId, studyRunId);
  const studyRunManifest = await downloadJson(g, studyRunManifestPath);
  const attemptId = studyRunManifest?.latestAttemptId;
  if (typeof attemptId !== "string" || !attemptId.trim()) {
    throw new Error(`latestAttemptId missing on study run manifest: ${studyRunManifestPath}`);
  }

  const attemptManifestKey =
    typeof studyRunManifest.latestAttemptManifestObjectKey === "string" &&
    studyRunManifest.latestAttemptManifestObjectKey.trim().length > 0
      ? studyRunManifest.latestAttemptManifestObjectKey
      : `${userId}/reader-document-extractions/${studyRunId}/${attemptId}/manifest.json`;
  const attemptManifest = await downloadJson(g, attemptManifestKey);
  if (!Array.isArray(attemptManifest?.documents) || attemptManifest.documents.length === 0) {
    throw new Error(`attempt manifest missing documents: ${attemptManifestKey}`);
  }

  const shaBySource = new Map();
  const filenameBySource = new Map();
  for (const row of await g.selectWhere("source_documents", { case_id: caseId })) {
    const id = String(row.id);
    if (row.sha256) {
      shaBySource.set(id, String(row.sha256));
    }
    if (row.filename) {
      filenameBySource.set(id, String(row.filename));
    }
  }
  for (const ref of ctx.sourceDocuments ?? []) {
    if (ref?.sourceDocumentId && ref.sha256) {
      shaBySource.set(ref.sourceDocumentId, ref.sha256);
    }
    if (ref?.sourceDocumentId && ref.filename) {
      filenameBySource.set(ref.sourceDocumentId, ref.filename);
    }
  }

  const succeeded = attemptManifest.documents.filter((row) => row.status === "SUCCEEDED");
  if (succeeded.length === 0) {
    throw new Error("no SUCCEEDED documents on attempt manifest");
  }

  const envelopesDir = join(outDir, "envelopes");
  const pagesDir = join(outDir, "document-pages");
  mkdirSync(envelopesDir, { recursive: true });
  mkdirSync(pagesDir, { recursive: true });

  const bySource = new Map();
  const packHashes = new Set();
  for (const row of succeeded) {
    const sourceDocumentId = String(row.sourceDocumentId);
    const envelopeKey = String(row.envelopeObjectKey);
    const rawEnvelope = await downloadJson(g, envelopeKey);
    const envelope = parseReaderDocumentExtractionEnvelope(rawEnvelope);
    if (envelope.sourceDocumentId !== sourceDocumentId) {
      throw new Error(`envelope sourceDocumentId mismatch for ${sourceDocumentId}`);
    }
    const packHash = envelope.packContentSha256?.toLowerCase();
    if (!packHash) {
      throw new Error(`packContentSha256 missing on envelope ${sourceDocumentId}`);
    }
    packHashes.add(packHash);

    const envelopeRel = join("envelopes", `${sourceDocumentId}.json`).replace(/\\/g, "/");
    writeCanonicalJson(join(outDir, envelopeRel), rawEnvelope);

    let pagesRel = null;
    const sha256 = shaBySource.get(sourceDocumentId);
    if (sha256) {
      const pagesKey = documentPagesStoragePath(userId, sha256);
      const pagesBytes = await g.download(pagesKey);
      const pagesRelPath = join("document-pages", `${sourceDocumentId}.json`).replace(/\\/g, "/");
      writeCanonicalJson(join(outDir, pagesRelPath), JSON.parse(new TextDecoder().decode(pagesBytes)));
      pagesRel = pagesRelPath;
    }

    bySource.set(sourceDocumentId, {
      sourceDocumentId,
      documentTypeId: readDocumentTypeId(envelope),
      envelopePath: envelopeRel,
      pagesPath: pagesRel,
      filename: filenameBySource.get(sourceDocumentId) ?? sourceDocumentId,
    });
  }

  if (packHashes.size !== 1) {
    throw new Error(`packContentSha256 must be identical across envelopes; saw ${[...packHashes].join(", ")}`);
  }
  const packContentSha256 = [...packHashes][0];

  const orderedIds = orderSourceDocumentIdsForEngine1({
    logicalDocuments,
    fallbackSourceDocumentIds: succeeded.map((row) => String(row.sourceDocumentId)),
  });
  const documents = orderedIds.map((sourceDocumentId) => {
    const entry = bySource.get(sourceDocumentId);
    if (!entry) {
      throw new Error(`missing exported envelope for ordered sourceDocumentId ${sourceDocumentId}`);
    }
    return entry;
  });

  let studyCreatedAt = null;
  try {
    const artifactKey = canonicalStudyArtifactPath(userId, studyRunId, attemptId);
    const artifact = await downloadJson(g, artifactKey);
    if (typeof artifact?.createdAt === "string" && artifact.createdAt.trim().length > 0) {
      studyCreatedAt = artifact.createdAt.trim();
    }
  } catch {
    studyCreatedAt = null;
  }

  const manifest = {
    studyRunId,
    attemptId,
    caseId,
    packContentSha256,
    exportedAt: studyCreatedAt ?? new Date().toISOString(),
    documents,
  };
  writeCanonicalJson(join(outDir, "manifest.json"), manifest);

  console.log(
    JSON.stringify(
      {
        studyRunId,
        attemptId,
        caseId,
        packContentSha256,
        documentCount: documents.length,
        outDir,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
