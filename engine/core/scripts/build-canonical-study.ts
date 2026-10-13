import { readFileSync, writeFileSync } from "node:fs";

import type { ProposalDomainPack } from "@hiveforyou/domain-pack";
import { validateProposalDomainPack } from "@hiveforyou/domain-pack/pack-driven-reader";
import type { CanonicalStudySourceContext } from "@hiveforyou/shared/canonical-study-artifact";
import { parseCanonicalStudyFoundationArtifact } from "@hiveforyou/shared/canonical-study-foundation";

import { buildCanonicalStudy } from "../src/study/canonical-study/index.js";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

const packPath = argValue("--pack");
const foundationPath = argValue("--foundation");
const sourceContextPath = argValue("--source-context");
const outPath = argValue("--out");

if (!packPath || !foundationPath) {
  console.error(
    "Usage: tsx engine/core/scripts/build-canonical-study.ts --pack <pack.json> --foundation <foundation.json> [--source-context ctx.json] [--out out.json]",
  );
  process.exit(1);
}

const pack = JSON.parse(readFileSync(packPath, "utf8")) as ProposalDomainPack;
const validation = validateProposalDomainPack(pack);
if (!validation.valid) {
  console.error("PACK_INVALID", validation.errors);
  process.exit(1);
}

const foundation = parseCanonicalStudyFoundationArtifact(
  JSON.parse(readFileSync(foundationPath, "utf8")),
);

const sourceContext: CanonicalStudySourceContext = sourceContextPath
  ? (JSON.parse(readFileSync(sourceContextPath, "utf8")) as CanonicalStudySourceContext)
  : {};

const artifact = buildCanonicalStudy({
  pack,
  packContentSha256: foundation.packContentSha256,
  foundation,
  sourceContext,
});

const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
if (outPath) {
  writeFileSync(outPath, serialized, "utf8");
} else {
  process.stdout.write(serialized);
}
