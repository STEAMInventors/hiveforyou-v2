import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const baselinePath = join(repoRoot, "engine/core/fixtures/l001-study-replay-baseline.json");
const outDir = join(repoRoot, "engine/intake/fixtures/golden/shadow/l001");
mkdirSync(outDir, { recursive: true });

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const claims = baseline.validation.accepted.claims.map((claim) => ({
  id: claim.id,
  evidenceRefs: claim.evidenceRefs.map((ref) => ({
    id: ref.id,
    sourceDocumentId: ref.sourceDocumentId,
    page: ref.page,
    extractionId: ref.extractionId,
    snippet: ref.snippet,
  })),
}));

writeFileSync(
  join(outDir, "v4-claims.json"),
  `${JSON.stringify({ studyRunId: "l001-replay-baseline", totalClaims: claims.length, claims }, null, 2)}\n`,
  "utf8",
);
console.info(`Seeded L001 v4-claims (${claims.length} claims)`);
