import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = join(SCRIPT_DIR, "..");
const STUDY_ROOT = join(CORE_ROOT, "src", "study");

const FOUNDATION_DIR = join(STUDY_ROOT, "canonical-study-foundation");
const ARTIFACT_DIR = join(STUDY_ROOT, "canonical-study");

function listRulesetSourceFiles() {
  const files = [];
  for (const dir of [FOUNDATION_DIR, ARTIFACT_DIR]) {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".ts")) {
        continue;
      }
      if (name.endsWith(".test.ts") || name === "ruleset-pin.ts") {
        continue;
      }
      files.push(join(dir, name));
    }
  }
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

export function computeCanonicalStudyRulesetContentSha256() {
  const hash = createHash("sha256");
  for (const absolutePath of listRulesetSourceFiles()) {
    const relativePath = relative(STUDY_ROOT, absolutePath).replace(/\\/g, "/");
    const content = readFileSync(absolutePath, "utf8").replace(/\r\n/g, "\n");
    hash.update(`${relativePath}\n`);
    hash.update(content);
  }
  return hash.digest("hex");
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(computeCanonicalStudyRulesetContentSha256());
}