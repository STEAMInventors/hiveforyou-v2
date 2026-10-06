import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const textExt = new Set([
  ".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".md", ".mdc", ".css", ".html", ".yaml", ".yml", ".sql", ".toml", ".txt", ".mdx",
]);
const skipDirs = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage"]);

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

let tracked = [];
try {
  tracked = execSync("git ls-files", { cwd: repoRoot, encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean);
} catch {
  process.exit(1);
}

const violations = [];
for (const rel of tracked) {
  if (rel.includes("utf16-bom") || rel.endsWith(".pdf")) {
    continue;
  }
  const ext = path.extname(rel).toLowerCase();
  if (!textExt.has(ext)) continue;
  const full = path.join(repoRoot, rel);
  if (!fs.existsSync(full)) continue;
  const buf = fs.readFileSync(full);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    violations.push(`${rel}: UTF-16 BOM`);
    continue;
  }
  if (buf.length >= 4 && buf[0] === 0 && buf[1] === 0x3c && buf[2] === 0 && buf[3] === 0x3f) {
    violations.push(`${rel}: UTF-16 LE (zero second byte)`);
    continue;
  }
  if (buf.length >= 2 && buf[1] === 0 && buf[0] !== 0 && buf[0] < 128) {
    violations.push(`${rel}: UTF-16 LE (zero second byte)`);
  }
}

if (violations.length) {
  console.error("UTF-8 text encoding check failed:\n" + violations.join("\n"));
  process.exit(1);
}
console.log(`UTF-8 text encoding check passed (${tracked.length} tracked paths scanned).`);
