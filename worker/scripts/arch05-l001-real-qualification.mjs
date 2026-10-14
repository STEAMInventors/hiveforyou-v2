import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { computeProposalPackContentSha256 } from "@hiveforyou/domain-pack/pack-driven-reader";
import {
  buildCanonicalStudy,
  buildCanonicalStudyFoundation,
  orderSourceDocumentIdsForEngine1,
  resolveCanonicalStudyRulesetIdentity,
  resolveDebugCanonicalStudyDomainPack,
  resolveCanonicalStudyInterpretation,
  CANONICAL_STUDY_RULESET_CONTENT_SHA256,
} from "@hiveforyou/core";
import {
  evaluateArch05L001Acceptance,
  L001_QUALIFICATION_AS_OF_DATE,
} from "@hiveforyou/domain-pack-iep/qualification/arch05-l001";
import {
  assertTrustedDocumentPagesPayload,
  bindDocumentPagesToSourceDocumentId,
} from "@hiveforyou/core/document/trusted-document-pages";
import {
  canonicalStudyArtifactPath,
  documentPagesStoragePath,
  readerDocumentExtractionAttemptManifestPath,
  readerDocumentExtractionEnvelopePath,
} from "@hiveforyou/shared/hive-artifact-paths";
import { parseReaderDocumentExtractionEnvelope } from "@hiveforyou/shared/reader-document-extraction";

const REPO_ROOT = process.cwd();
const STUDY_RUN_ID = "d1d6f7fa-df5f-4fb9-8fe4-2b064b1d49d0";
const ATTEMPT_ID = "6246c078-3d04-4834-9f5b-884cc237c016";
const READER_PACK_SHA = "c2baa0439d32496a3110f5388f6048395a9f4c8fdce79b3d0cec36ae6b9a7775";
const EXPECTED_RULESET_SHA = CANONICAL_STUDY_RULESET_CONTENT_SHA256;
const BUCKET = "document-pages";
const OUT_DIR = join(REPO_ROOT, "artifacts", "arch05-l001-qualification");

function readWorkerEnv() {
  const raw = readFileSync(join(REPO_ROOT, "worker", ".env.local"), "utf8");
  const map = new Map();
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) map.set(t.slice(0, i).trim(), t.slice(i + 1).trim());
  }
  const url = map.get("NEXT_PUBLIC_SUPABASE_URL");
  const key = map.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("worker/.env.local incomplete");
  return { url, key };
}

function gw(client) {
  return {
    async selectWhere(table, where, limit) {
      let q = client.schema("hive").from(table).select("*");
      for (const [k, v] of Object.entries(where)) q = q.eq(k, v);
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    async dl(bucket, path) {
      const { data, error } = await client.storage.from(bucket).download(path);
      if (error) throw new Error(error.message);
      return new Uint8Array(await data.arrayBuffer());
    },
  };
}

async function json(g, key) {
  try {
    return JSON.parse(new TextDecoder().decode(await g.dl(BUCKET, key)));
  } catch {
    return null;
  }
}

async function main() {
  const { url, key } = readWorkerEnv();
  const client = createClient(url, key);
  const g = gw(client);
  const run = (await g.selectWhere("study_runs", { id: STUDY_RUN_ID }, 1))[0];
  if (!run) throw new Error("study run missing");
  const userId = String(run.user_id);
  const caseId = String(run.case_id);
  const ctxRow = (await g.selectWhere("study_contexts", { study_run_id: STUDY_RUN_ID }, 1))[0];
  const ctx = ctxRow?.context_json ?? {};
  const logicalDocuments = ctx.structureMap?.logicalDocuments ?? ctx.logicalDocuments ?? [];
  const manifestPath = readerDocumentExtractionAttemptManifestPath(userId, STUDY_RUN_ID, ATTEMPT_ID);
  const manifest = await json(g, manifestPath);
  if (!manifest?.documents?.length) throw new Error("manifest missing");
  const envelopes = [];
  for (const row of manifest.documents) {
    const p =
      row.envelopeObjectKey ??
      readerDocumentExtractionEnvelopePath(userId, STUDY_RUN_ID, ATTEMPT_ID, row.sourceDocumentId);
    const raw = await json(g, p);
    if (!raw) throw new Error(`envelope missing ${p}`);
    envelopes.push(parseReaderDocumentExtractionEnvelope(raw));
  }
  if (envelopes.length !== 8) throw new Error("expected 8 envelopes");
  const hashes = new Set(envelopes.map((e) => e.packContentSha256?.toLowerCase()));
  if (hashes.size !== 1 || !hashes.has(READER_PACK_SHA)) throw new Error("pack sha mismatch");
  const pack = resolveDebugCanonicalStudyDomainPack({
    envelopePackId: envelopes[0].packId,
    envelopePackVersion: envelopes[0].packVersion,
    envelopePackContentSha256: READER_PACK_SHA,
  });
  const snap = join(REPO_ROOT, "brain/domain-packs/iep/snapshots", `${READER_PACK_SHA}.json`);
  const snapPack = JSON.parse(readFileSync(snap, "utf8"));
  const snapHash = computeProposalPackContentSha256(snapPack).toLowerCase();
  if (snapHash !== READER_PACK_SHA) {
    throw new Error(`snapshot content hash drift: ${snapHash}`);
  }
  const snapFileSha = createHash("sha256").update(readFileSync(snap)).digest("hex");
  const ruleset = resolveCanonicalStudyRulesetIdentity();
  if (
    ruleset.rulesetContentSha256 !== EXPECTED_RULESET_SHA ||
    CANONICAL_STUDY_RULESET_CONTENT_SHA256 !== EXPECTED_RULESET_SHA
  ) {
    throw new Error("ruleset sha mismatch");
  }
  const shaBy = new Map();
  for (const row of await g.selectWhere("source_documents", { case_id: caseId })) {
    shaBy.set(String(row.id), String(row.sha256));
  }
  for (const ref of ctx.sourceDocuments ?? []) {
    if (ref.sourceDocumentId && ref.sha256) shaBy.set(ref.sourceDocumentId, ref.sha256);
  }
  const ordered = orderSourceDocumentIdsForEngine1({
    logicalDocuments,
    fallbackSourceDocumentIds: manifest.documents.map((d) => d.sourceDocumentId),
  });
  const bySrc = new Map(envelopes.map((e) => [e.sourceDocumentId, e]));
  const docs = [];
  for (const id of ordered) {
    const env = bySrc.get(id);
    if (!env) throw new Error(`no envelope ${id}`);
    const sha = shaBy.get(id);
    let pages = null;
    if (sha) {
      pages = bindDocumentPagesToSourceDocumentId(
        assertTrustedDocumentPagesPayload(await g.dl(BUCKET, documentPagesStoragePath(userId, sha)), sha),
        id,
      );
    }
    docs.push({ sourceDocumentId: id, envelope: env, documentPages: pages });
  }
  const beforeKey = canonicalStudyArtifactPath(userId, STUDY_RUN_ID, ATTEMPT_ID);
  const before = await json(g, beforeKey);
  if (!before) throw new Error("before artifact missing");
  const sourceContext = {
    logicalDocuments: logicalDocuments.map((d) => ({
      sourceDocumentId: d.sourceDocumentId,
      logicalDocumentId: d.id,
      filename: d.title,
    })),
    asOfDate: L001_QUALIFICATION_AS_OF_DATE,
  };
  const createdAt = before.createdAt ?? new Date(0).toISOString();
  const interpretation = resolveCanonicalStudyInterpretation({
    readerPack: pack.pack,
    readerPackContentSha256: READER_PACK_SHA,
    domainId: envelopes[0].domainId,
  });
  const foundation = buildCanonicalStudyFoundation({
    pack: interpretation.mergedPack,
    packContentSha256: pack.contentSha256,
    caseId,
    createdAt,
    documents: docs,
  });
  const after = buildCanonicalStudy({
    pack: interpretation.mergedPack,
    packContentSha256: READER_PACK_SHA,
    interpretationRulesetId: interpretation.overlay.manifest.id,
    interpretationRulesetContentSha256: interpretation.overlayContentSha256,
    foundation,
    sourceContext,
    createdAt,
  });
  const mf = foundation.verifiedFields.find((f) => f.fieldId === "minutes_per_week");
  const mpw = typeof mf?.normalized.normalizedValue === "number" ? mf.normalized.normalizedValue : null;
  const beforeChecks = evaluateArch05L001Acceptance(before, null);
  const afterChecks = evaluateArch05L001Acceptance(after, mpw);
  const table = beforeChecks.map((b, i) => ({
    criterion: b.id,
    before: { pass: b.pass, observed: b.observed },
    after: { pass: afterChecks[i].pass, observed: afterChecks[i].observed },
    expected: b.expected,
    delta: b.pass === afterChecks[i].pass ? "unchanged" : b.pass ? "regressed" : "improved",
  }));
  const failedBefore = beforeChecks.filter((x) => !x.pass);
  const failedAfter = afterChecks.filter((x) => !x.pass);
  const recommendation =
    failedAfter.length === 0 ? "PASS" : failedAfter.length < failedBefore.length ? "PARTIAL" : "FAIL";
  mkdirSync(OUT_DIR, { recursive: true });
  const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(OUT_DIR, `arch05-l001-qualification-report-${runStamp}.json`);
  const afterPath = join(OUT_DIR, `canonical-study-after-${runStamp}.json`);
  writeFileSync(afterPath, `${JSON.stringify(after, null, 2)}\n`);
  writeFileSync(
    outPath,
    `${JSON.stringify(
      {
        schemaVersion: "arch05-l001-qualification/1",
        baseline: {
          studyRunId: STUDY_RUN_ID,
          attemptId: ATTEMPT_ID,
          readerPackSha256: READER_PACK_SHA,
          interpretationRulesetId: interpretation.overlay.manifest.id,
          interpretationRulesetContentSha256: interpretation.overlayContentSha256,
          interpretationOverlayPath: interpretation.overlayPath,
          qualificationAsOfDate: L001_QUALIFICATION_AS_OF_DATE,
          canonicalRulesetSha256: EXPECTED_RULESET_SHA,
        },
        caseId,
        userId,
        readerPack: { path: pack.path, source: pack.source, snapshotContentSha256: snapHash, snapshotFileSha256: snapFileSha },
        ruleset,
        beforeArtifactObjectKey: beforeKey,
        outputs: { report: outPath, afterArtifact: afterPath },
        comparisonTable: table,
        failedAfter,
        failedBefore,
        recommendation,
        manifestUtf16Note: {
          file: "brain/domain-packs/iep/snapshots/manifest.json",
          utf16: true,
          referencedInProductionLoader: false,
          affectsCoreTestRunner: true,
        },
      },
      null,
      2,
    )}\n`,
  );
  console.log(JSON.stringify({ recommendation, failedAfter: failedAfter.length, failedBefore: failedBefore.length, outPath }, null, 2));
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
