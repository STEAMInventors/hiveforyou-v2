import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const intakeRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

process.env.UPDATE_EXTRACTION_FIXTURE_GOLDENS = "1";
const result = spawnSync(
  "pnpm",
  ["exec", "vitest", "run", "src/extraction/extraction-fixtures.golden.test.ts"],
  { cwd: intakeRoot, stdio: "inherit", shell: true, env: process.env },
);
process.exit(result.status ?? 1);
