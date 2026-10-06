/**
 * Shadow study golden: record/replay tier-1 and diff normalized output.
 *
 * pnpm golden:shadow --case l001|caleb9 [--record] [--update --reason "..."]
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { executeGoldenShadow } from "./shadow-golden/run-golden.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");

function loadRepoDotEnv() {
  const envPath = join(repoRoot, ".env");
  try {
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
  } catch {
    // optional
  }
}

function parseCli(argv) {
  let caseId = null;
  let record = false;
  let update = false;
  let reason = null;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--case") {
      caseId = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (token === "--record") {
      record = true;
      continue;
    }
    if (token === "--update") {
      update = true;
      continue;
    }
    if (token === "--reason") {
      reason = argv[i + 1] ?? null;
      i += 1;
    }
  }
  if (caseId !== "l001" && caseId !== "caleb9") {
    throw new Error("Usage: golden:shadow --case l001|caleb9 [--record] [--update --reason \"...\"]");
  }
  return { caseId, record, update, reason };
}

loadRepoDotEnv();
const cli = parseCli(process.argv.slice(2));
const code = await executeGoldenShadow(cli);
process.exit(code);
