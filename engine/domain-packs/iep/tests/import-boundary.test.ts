import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const packRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const forbiddenImport = /from\s+["']@hiveforyou\/intake["']/;

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "tests") {
      continue;
    }
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (/\.(ts|tsx|mjs)$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

describe("IEP pack import boundary", () => {
  it("does not depend on Intake implementation packages", () => {
    const packageJson = JSON.parse(
      readFileSync(join(packRoot, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };
    expect(deps["@hiveforyou/intake"]).toBeUndefined();

    const offenders: string[] = [];
    for (const file of sourceFiles(packRoot)) {
      const text = readFileSync(file, "utf8");
      if (forbiddenImport.test(text)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
