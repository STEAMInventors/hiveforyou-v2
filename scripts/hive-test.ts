#!/usr/bin/env tsx
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { defaultDeclarativePackRepoRoot } from "../engine/domain-packs/registry/declarative/repo-root.js";
import {
  compileMappingPackStageViews,
  resolveMappingPackForDomain,
} from "../engine/domain-packs/registry/mapping-pack/index.js";
import {
  printDiscoverQualificationReport,
  runDiscoverQualificationCase,
} from "../engine/core/src/discover/mapping-pack/run-discover-qualification-case.js";
import {
  printReaderQualificationReport,
  runReaderQualificationCase,
} from "../engine/core/src/study/mapping-pack/run-reader-qualification-case.js";

const repoRoot = defaultDeclarativePackRepoRoot();

function parseArgs(argv: string[]) {
  const stageIdx = argv.indexOf("--stage");
  const stage = stageIdx >= 0 ? argv[stageIdx + 1] : undefined;
  const caseIdx = argv.indexOf("--case");
  const caseId = caseIdx >= 0 ? argv[caseIdx + 1] : undefined;
  const live = argv.includes("--live");
  return { stage, caseId, live };
}

function printPackQualificationReport() {
  const cases: Array<{ label: string; resolved: ReturnType<typeof resolveMappingPackForDomain> }> = [
    {
      label: "IEP specialized",
      resolved: resolveMappingPackForDomain({
        domainId: "iep",
        domainResolution: "known",
        repoRoot,
        allowPrerelease: true,
      }),
    },
    {
      label: "Generic fallback (unknown domain)",
      resolved: resolveMappingPackForDomain({
        domainId: "bankruptcy",
        domainResolution: "unknown",
        repoRoot,
      }),
    },
  ];

  for (const item of cases) {
    const compiled = compileMappingPackStageViews(item.resolved);
    const stages = Object.keys(compiled.views).sort();
    console.log(`\n=== ${item.label} ===`);
    console.log(`packId=${compiled.pin.packId}`);
    console.log(`packVersion=${compiled.pin.packVersion}`);
    console.log(`contentDigest=${compiled.pin.contentDigest}`);
    console.log(`selection=${compiled.pin.selection}`);
    console.log(`compiledStages=${stages.join(",")}`);
    for (const stage of stages) {
      const view = compiled.views[stage as keyof typeof compiled.views];
      console.log(`  ${stage}: schemaVersion=${view.schemaVersion} digest=${view.packPin.contentDigest}`);
    }
  }
}

function runPackStage(scriptDir: string) {
  const vitest = spawnSync(
    "pnpm",
    [
      "--filter",
      "@hiveforyou/domain-packs",
      "exec",
      "vitest",
      "run",
      "tests/mapping-pack.test.ts",
      "tests/registry.test.ts",
    ],
    {
      cwd: join(scriptDir, ".."),
      stdio: "inherit",
      shell: true,
    },
  );

  printPackQualificationReport();

  if (vitest.status !== 0) {
    console.error("\nDP-02 pack qualification: FAIL");
    process.exit(vitest.status ?? 1);
  }
  console.log("\nDP-02 pack qualification: PASS");
}

function runDiscoverStage(scriptDir: string, caseId: string | undefined, live: boolean) {
  if (live) {
    console.error("Discover qualification does not invoke live models in DP-03A. Omit --live.");
    process.exit(2);
  }

  const vitest = spawnSync(
    "pnpm",
    [
      "--filter",
      "@hiveforyou/core",
      "exec",
      "vitest",
      "run",
      "src/discover/mapping-pack/discover-mapping-pack.test.ts",
    ],
    {
      cwd: join(scriptDir, ".."),
      stdio: "inherit",
      shell: true,
    },
  );

  if (vitest.status !== 0) {
    console.error("\nDP-03A discover unit qualification: FAIL");
    process.exit(vitest.status ?? 1);
  }

  const cases = caseId ? [caseId] : ["L001", "bankruptcy", "unknown"];
  let allPass = true;
  for (const id of cases) {
    try {
      const result = runDiscoverQualificationCase(id);
      printDiscoverQualificationReport(result);
      if (!result.validationOk) {
        allPass = false;
      }
    } catch (error) {
      allPass = false;
      console.error(`\nDiscover qualification case ${id}: FAIL`, error);
    }
  }

  if (!allPass) {
    console.error("\nDP-03A discover qualification: FAIL");
    process.exit(1);
  }
  console.log("\nDP-03A discover qualification: PASS");
}

function runReaderStage(scriptDir: string, caseId: string | undefined, live: boolean) {
  if (live) {
    console.error(
      "Reader qualification uses fixture replay in DP-03B. Omit --live or use worker l001:agentic-reader-qualification when live STOP is lifted.",
    );
    process.exit(2);
  }

  const vitest = spawnSync(
    "pnpm",
    [
      "--filter",
      "@hiveforyou/core",
      "exec",
      "vitest",
      "run",
      "src/study/mapping-pack/reader-mapping-pack.test.ts",
    ],
    {
      cwd: join(scriptDir, ".."),
      stdio: "inherit",
      shell: true,
    },
  );

  if (vitest.status !== 0) {
    console.error("\nDP-03B reader unit qualification: FAIL");
    process.exit(vitest.status ?? 1);
  }

  const cases = caseId ? [caseId] : ["L001", "bankruptcy", "unknown"];
  let allPass = true;
  for (const id of cases) {
    try {
      const result = runReaderQualificationCase(id);
      printReaderQualificationReport(result);
      if (!result.validationOk) {
        allPass = false;
      }
    } catch (error) {
      allPass = false;
      console.error(`\nReader qualification case ${id}: FAIL`, error);
    }
  }

  if (!allPass) {
    console.error("\nDP-03B reader qualification: FAIL");
    process.exit(1);
  }
  console.log("\nDP-03B reader qualification: PASS");
}

function main() {
  const { stage, caseId, live } = parseArgs(process.argv.slice(2));
  const scriptDir = dirname(fileURLToPath(import.meta.url));

  if (stage === "pack") {
    runPackStage(scriptDir);
    return;
  }

  if (stage === "discover") {
    runDiscoverStage(scriptDir, caseId, live);
    return;
  }

  if (stage === "reader") {
    runReaderStage(scriptDir, caseId, live);
    return;
  }

  console.error("Usage: pnpm hive:test --stage pack");
  console.error("       pnpm hive:test --stage discover [--case L001|bankruptcy|unknown]");
  console.error("       pnpm hive:test --stage reader [--case L001|bankruptcy|unknown] [--live]");
  process.exit(2);
}

main();
