/**
 * Export accepted v4 claims from a production study run into golden v4-claims.json.
 *
 * pnpm --filter @hiveforyou/core exec tsx --env-file=../../.env scripts/shadow-golden/export-v4-claims.mjs \
 *   --study-run-id <uuid> --case caleb9
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../../..");

const DEFAULT_CALEB_RUN = "3a739f34-0556-4417-982f-4fedae79ab34";

function loadRepoDotEnv() {
  const envPath = join(repoRoot, ".env");
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseCli(argv) {
  let studyRunId = DEFAULT_CALEB_RUN;
  let caseId = "caleb9";
  let expectedTotal = null;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--study-run-id") {
      studyRunId = argv[i + 1] ?? studyRunId;
      i += 1;
      continue;
    }
    if (token === "--case") {
      caseId = argv[i + 1] ?? caseId;
      i += 1;
      continue;
    }
    if (token === "--expected-total") {
      expectedTotal = Number(argv[i + 1]);
      i += 1;
    }
  }
  if (expectedTotal == null) {
    expectedTotal = caseId === "caleb9" ? 65 : 37;
  }
  return { studyRunId, caseId, expectedTotal };
}

loadRepoDotEnv();
const cli = parseCli(process.argv.slice(2));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: artifactRows, error: artifactError } = await supabase
  .schema("hive")
  .from("study_artifacts")
  .select("validation_result_json")
  .eq("study_run_id", cli.studyRunId)
  .limit(1);

if (artifactError) {
  console.error(artifactError.message);
  process.exit(1);
}
const validation = artifactRows?.[0]?.validation_result_json;
if (!validation?.accepted?.claims) {
  console.error(`No validation_result_json for study_run_id=${cli.studyRunId}`);
  process.exit(1);
}

const claims = validation.accepted.claims.map((claim) => ({
  id: claim.id,
  evidenceRefs: claim.evidenceRefs.map((ref) => ({
    id: ref.id,
    sourceDocumentId: ref.sourceDocumentId,
    page: ref.page,
    extractionId: ref.extractionId,
    snippet: ref.snippet,
  })),
}));

if (claims.length !== cli.expectedTotal) {
  console.error(
    `Claim count mismatch: expected ${cli.expectedTotal}, got ${claims.length} for study_run_id=${cli.studyRunId}`,
  );
  process.exit(1);
}

const { data: shadowRows, error: shadowError } = await supabase
  .schema("hive")
  .from("shadow_study_artifacts")
  .select("coverage_json,status")
  .eq("study_run_id", cli.studyRunId)
  .limit(1);

if (shadowError) {
  console.error(shadowError.message);
  process.exit(1);
}

const coverage = shadowRows?.[0]?.coverage_json;
if (coverage && typeof coverage === "object") {
  const covered = coverage.coveredClaims ?? coverage.covered;
  const total = coverage.totalClaims ?? coverage.total;
  if (covered != null && total != null && !(covered === 51 && total === 65)) {
    console.warn(
      `WARN: shadow coverage ${covered}/${total} (expected 51/65) for study_run_id=${cli.studyRunId}`,
    );
  }
}

const outDir = join(repoRoot, "engine/intake/fixtures/golden/shadow", cli.caseId);
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "v4-claims.json");
writeFileSync(
  outPath,
  `${JSON.stringify(
    {
      studyRunId: cli.studyRunId,
      totalClaims: claims.length,
      claims,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.info(`Wrote ${outPath} (${claims.length} claims)`);
