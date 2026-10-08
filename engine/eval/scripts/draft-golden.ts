/**
 * Seed a reviewable DRAFT golden case from a recorded study baseline (v4 / v4.1).
 * Does not grade, score, or mark output as human-verified.
 *
 * Usage:
 *   pnpm --filter @hiveforyou/eval golden:draft -- --case l001 --prompt-version v4.1 --out engine/eval/golden/tune/l001.json
 *   pnpm --filter @hiveforyou/eval golden:draft -- --case l001 --ensure-document-pages
 *
 * Runs under @hiveforyou/core (see package.json) so shadow-golden document-page and intake extraction
 * paths resolve without @hiveforyou/intake on the eval package.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { mapV4EvidenceRefToWordRange } from "@hiveforyou/core/atoms/map-v4-evidence";
import type { PageModel } from "@hiveforyou/core/document/page-model";
import { loadRecoveredPagesByPdf } from "@hiveforyou/core/eval-draft/load-recovered-corpus";
import {
  ensureDocumentPagesSnapshot,
  readDocumentPagesSnapshot,
} from "@hiveforyou/core/shadow-golden/ensure-document-pages";
import { stableJson } from "@hiveforyou/core/shadow-golden/prompt-hash";
import type { ClaimModality, ClaimValueV4 } from "@hiveforyou/shared/case-intelligence/4";
import type { NestIepRecoveredPage } from "@hiveforyou/shared/intake";

import {
  assertGoldenSplit,
  validateGoldenCase,
  type GoldenSplit,
} from "../src/golden/validate.ts";
import type { DraftGoldenCase, GoldenFact, GoldenTripwire } from "../src/golden/types.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const evalRoot = resolve(scriptDir, "..");
const repoRoot = resolve(evalRoot, "../..");

const CASE_TO_SPLIT: Record<string, GoldenSplit> = {
  l001: "tune",
  l002: "tune",
  l003: "tune",
  l005: "tune",
  l004: "holdout",
  l006: "holdout",
  /** Mandatory before agentic Reader tripwire/shadow promotion; not a T1.2 closure blocker. */
  injection: "tripwire",
};

/** Baselines captured under T0.2 (other cases await baseline recording). */
const BASELINE_CASE_ID: Partial<Record<string, string>> = {
  l001: "l001",
  caleb9: "caleb9",
  l002: "caleb9",
};

type ManifestFile = { filename: string; sha256: string; sourceDocumentId?: string };
type CaseManifest = { files: ManifestFile[]; sourceIdPrefix?: string };

type BaselineEvidenceRef = {
  id: string;
  sourceDocumentId: string;
  page?: number;
  extractionId?: string;
  snippet?: string;
};

type BaselineAcceptedClaim = {
  id: string;
  role?: ClaimModality;
  evidenceRefs: BaselineEvidenceRef[];
  value: Record<string, unknown>;
};

type StudyBaseline = {
  caseId: string;
  acceptedClaims?: BaselineAcceptedClaim[];
};

function parseArgs(argv: string[]): {
  caseId: string;
  promptVersion: string;
  outPath: string | null;
  ensureDocumentPages: boolean;
  force: boolean;
} {
  let caseId = "";
  let promptVersion = "v4.1";
  let outPath: string | null = null;
  let ensureDocumentPages = false;
  let force = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--case") {
      caseId = (argv[++i] ?? "").toLowerCase();
    } else if (arg === "--prompt-version") {
      promptVersion = argv[++i] ?? promptVersion;
    } else if (arg === "--out") {
      outPath = argv[++i] ?? null;
    } else if (arg === "--ensure-document-pages") {
      ensureDocumentPages = true;
    } else if (arg === "--force") {
      force = true;
    } else if (arg === "--help" || arg === "-h") {
      console.error(
        "Usage: golden:draft --case <id> [--prompt-version v4.1] [--out path] [--ensure-document-pages] [--force]",
      );
      process.exit(0);
    }
  }

  if (!caseId) {
    throw new Error("Missing required --case <id>");
  }

  return { caseId, promptVersion, outPath, ensureDocumentPages, force };
}

function repoRelative(path: string): string {
  return path.replace(/\\/g, "/").replace(new RegExp(`^${repoRoot.replace(/\\/g, "/")}/`), "");
}

function corpusDirForCase(caseId: string): string {
  return join(repoRoot, "engine/intake/fixtures", caseId);
}

function baselinePathFor(caseId: string, promptVersion: string): string {
  const baselineCase = BASELINE_CASE_ID[caseId] ?? caseId;
  return join(repoRoot, "engine/eval/baselines", `${baselineCase}-${promptVersion}.json`);
}

function defaultOutPath(caseId: string): string {
  const split = CASE_TO_SPLIT[caseId];
  if (!split || !assertGoldenSplit(split)) {
    throw new Error(`Unknown caseId for golden split: ${caseId}`);
  }
  return join(evalRoot, "golden", split, `${caseId}.json`);
}

function readManifest(corpusDir: string): CaseManifest | null {
  const manifestPath = join(corpusDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    return null;
  }
  return JSON.parse(readFileSync(manifestPath, "utf8")) as CaseManifest;
}

function baselineValueToClaimValue(value: Record<string, unknown>): ClaimValueV4 | null {
  const kind = value.kind;
  if (kind === "date" && typeof value.value === "string") {
    return { kind: "date", dateValue: value.value };
  }
  if (kind === "text" && typeof value.text === "string") {
    return { kind: "text", textValue: value.text };
  }
  if (kind === "boolean" && typeof value.value === "boolean") {
    return { kind: "boolean", booleanValue: value.value };
  }
  if (kind === "quantity" && typeof value.amount === "number") {
    return {
      kind: "quantity",
      numberValue: value.amount,
      unit: typeof value.unit === "string" ? value.unit : null,
    };
  }
  if (kind === "entity_ref" && typeof value.entityId === "string") {
    return { kind: "entity_ref", entityId: value.entityId };
  }
  if (kind === "code" && typeof value.code === "string") {
    return { kind: "code", codeValue: value.code };
  }
  if (kind === "period") {
    return {
      kind: "period",
      periodStart: typeof value.start === "string" ? value.start : null,
      periodEnd: typeof value.end === "string" ? value.end : null,
    };
  }
  if (kind === "unknown") {
    return { kind: "unknown" };
  }
  return null;
}

function sourceIdToPdf(input: {
  baselineManifest: CaseManifest | null;
  corpusManifest: CaseManifest | null;
  baselineCaseId: string;
  corpusCaseId: string;
}): Map<string, string> {
  const map = new Map<string, string>();
  const corpusFiles = input.corpusManifest?.files ?? [];
  const baselineFiles = input.baselineManifest?.files ?? [];
  if (baselineFiles.length > 0) {
    baselineFiles.forEach((bFile, index) => {
      const sourceId = bFile.sourceDocumentId ?? `${input.baselineCaseId}-src-${index + 1}`;
      const corpusFile =
        corpusFiles.find((f) => f.filename === bFile.filename) ??
        corpusFiles[index];
      if (corpusFile) {
        map.set(sourceId, corpusFile.filename);
      }
    });
    return map;
  }
  const prefix = input.corpusManifest?.sourceIdPrefix ?? `-src`;
  corpusFiles.forEach((file, index) => {
    const sourceId = file.sourceDocumentId ?? `${input.corpusCaseId}${prefix}-${index + 1}`;
    map.set(sourceId, file.filename);
  });
  return map;
}

function mapClaimToFact(input: {
  claim: BaselineAcceptedClaim;
  sourceToPdf: Map<string, string>;
  pagesByDoc: Map<string, NestIepRecoveredPage[]>;
  documentPagesByDoc: Map<string, PageModel[]>;
}): GoldenFact | null {
  const ref = input.claim.evidenceRefs[0];
  if (!ref) {
    return null;
  }
  const pdf = input.sourceToPdf.get(ref.sourceDocumentId) ?? ref.sourceDocumentId;
  const pageNumber = ref.page ?? 1;
  const recovered = input.pagesByDoc.get(pdf)?.find((p) => p.pageNumber === pageNumber);
  const pageModel = input.documentPagesByDoc.get(pdf)?.find((p) => p.pageNumber === pageNumber);
  if (!recovered || !pageModel) {
    return null;
  }

  const wordRange = mapV4EvidenceRefToWordRange({
    documentId: pdf,
    recoveredPage: recovered,
    pageModel,
    ref: {
      sourceDocumentId: ref.sourceDocumentId,
      page: pageNumber,
      extractionId: ref.extractionId,
      snippet: ref.snippet,
    },
  });
  if (!wordRange) {
    return null;
  }

  const value = baselineValueToClaimValue(input.claim.value);
  if (!value) {
    return null;
  }

  const modality = input.claim.role ?? "observed";

  return {
    id: input.claim.id,
    documentId: pdf,
    pageNumber,
    wordRange,
    value,
    acceptableModalities: [modality],
  };
}

async function ensureAllDocumentPages(corpusDir: string, manifest: CaseManifest | null): Promise<void> {
  const files = manifest?.files ?? [];
  if (files.length === 0) {
    throw new Error(`No manifest.json in ${corpusDir}; cannot ensure document-pages`);
  }
  for (const file of files) {
    const result = await ensureDocumentPagesSnapshot({
      corpusDir,
      pdfFilename: file.filename,
      sha256: file.sha256,
    });
    console.error(
      result.created
        ? `created document-pages snapshot: ${file.filename}`
        : `document-pages present: ${file.filename}`,
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const corpusDir = corpusDirForCase(args.caseId);
  if (!existsSync(corpusDir)) {
    throw new Error(`Missing corpus directory: ${corpusDir}`);
  }

  const manifest = readManifest(corpusDir);
  const baselinePath = baselinePathFor(args.caseId, args.promptVersion);
  const hasBaseline = existsSync(baselinePath);

  if (args.ensureDocumentPages) {
    await ensureAllDocumentPages(corpusDir, manifest);
  }

  if (!hasBaseline) {
    if (args.ensureDocumentPages && !args.outPath) {
      console.error(`Document pages ensured for ${args.caseId}; no baseline at ${baselinePath}.`);
      return;
    }
    throw new Error(`No baseline at ${baselinePath} (T0.2 baselines exist for l001 and caleb9 only)`);
  }

  const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as StudyBaseline;
  const split = CASE_TO_SPLIT[args.caseId];
  if (!split) {
    throw new Error(`No golden split configured for case ${args.caseId}`);
  }

  const outPath = args.outPath ? resolve(args.outPath) : defaultOutPath(args.caseId);
  if (existsSync(outPath) && !args.force) {
    const existing = JSON.parse(readFileSync(outPath, "utf8")) as { verifiedBy?: unknown };
    if (typeof existing.verifiedBy === "string" && existing.verifiedBy.trim().length > 0) {
      throw new Error(`Refusing to overwrite certified golden ${outPath} (pass --force to override)`);
    }
  }

  await ensureAllDocumentPages(corpusDir, manifest);

  const pagesByDoc = await loadRecoveredPagesByPdf(corpusDir, manifest);
  const documentPagesByDoc = new Map<string, PageModel[]>();
  for (const file of manifest?.files ?? []) {
    const snapshotPath = join(corpusDir, "document-pages", file.filename.replace(/\.pdf$/i, ".json"));
    const documentPages = readDocumentPagesSnapshot(snapshotPath);
    documentPagesByDoc.set(file.filename, documentPages.pages);
  }

  const baselineCaseId = BASELINE_CASE_ID[args.caseId] ?? args.caseId;
  const baselineManifest = readManifest(corpusDirForCase(baselineCaseId));
  const sourceToPdf = sourceIdToPdf({
    baselineManifest,
    corpusManifest: manifest,
    baselineCaseId,
    corpusCaseId: args.caseId,
  });
  const facts: GoldenFact[] = [];
  let skipped = 0;
  for (const claim of baseline.acceptedClaims ?? []) {
    const fact = mapClaimToFact({
      claim,
      sourceToPdf,
      pagesByDoc,
      documentPagesByDoc,
    });
    if (fact) {
      facts.push(fact);
    } else {
      skipped += 1;
    }
  }

  const draft: DraftGoldenCase = {
    caseId: args.caseId,
    split,
    corpusDir: repoRelative(corpusDir),
    facts,
    gaps: [],
    tripwires: [] as GoldenTripwire[],
    verifiedBy: null,
    draft: true,
  };

  const validated = validateGoldenCase(draft);
  if (!validated.ok) {
    throw new Error(
      `Draft failed validation:\n${validated.issues.map((i) => `${i.path}: ${i.message}`).join("\n")}`,
    );
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${stableJson(validated.value)}\n`, "utf8");
  console.error(
    `Wrote draft golden (${facts.length} facts, ${skipped} claims skipped for missing word ranges) -> ${repoRelative(outPath)}`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
