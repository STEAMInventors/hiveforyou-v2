import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { hiveMonorepoRoot } from "./resolve-hive-monorepo-root.js";

const COMPATIBILITY_SCHEMA = "hive.domain-pack.interpretation-compatibility/0.1" as const;

type CompatibilityEntry = {
  readerPackContentSha256: string;
  interpretationOverlayPath: string;
};

type CompatibilityFile = {
  schemaVersion: typeof COMPATIBILITY_SCHEMA;
  entries: CompatibilityEntry[];
};

function domainPacksRoot(env: Record<string, string | undefined>): string {
  const override = env.HIVE_DOMAIN_PACKS_BRAIN_DIR?.trim();
  if (override) {
    return override;
  }
  return join(hiveMonorepoRoot(), "brain", "domain-packs");
}

function parseCompatibility(raw: unknown, filePath: string): CompatibilityFile {
  if (typeof raw !== "object" || raw == null) {
    throw new Error(`Invalid interpretation compatibility file: ${filePath}`);
  }
  const file = raw as CompatibilityFile;
  if (file.schemaVersion !== COMPATIBILITY_SCHEMA || !Array.isArray(file.entries)) {
    throw new Error(`Unsupported interpretation compatibility schema: ${filePath}`);
  }
  return file;
}

/** Resolve overlay JSON path from domain pack brain folders (no domain-specific defaults in Core). */
export function resolveInterpretationOverlayPath(input: {
  readerPackContentSha256: string;
  domainId?: string | null;
  env?: Record<string, string | undefined>;
}): { overlayPath: string; domainFolder: string } | null {
  const env = input.env ?? process.env;
  const hash = input.readerPackContentSha256.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    return null;
  }

  const root = domainPacksRoot(env);
  const domainFilter = input.domainId?.trim().toLowerCase() ?? null;

  const domainDirs: string[] = [];
  if (domainFilter) {
    const scoped = join(root, domainFilter, "interpretation");
    if (existsSync(scoped)) {
      domainDirs.push(domainFilter);
    }
  } else if (existsSync(root)) {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith("_")) {
        domainDirs.push(entry.name);
      }
    }
  }

  const matches: Array<{ overlayPath: string; domainFolder: string }> = [];
  for (const domainFolder of domainDirs.sort((a, b) => a.localeCompare(b))) {
    const compatibilityPath = join(root, domainFolder, "interpretation", "compatibility.json");
    if (!existsSync(compatibilityPath)) {
      continue;
    }
    const file = parseCompatibility(JSON.parse(readFileSync(compatibilityPath, "utf8")), compatibilityPath);
    for (const entry of file.entries) {
      if (entry.readerPackContentSha256.toLowerCase() !== hash) {
        continue;
      }
      const overlayPath = join(root, domainFolder, "interpretation", entry.interpretationOverlayPath);
      matches.push({ overlayPath, domainFolder });
    }
  }

  if (matches.length === 0) {
    return null;
  }
  if (matches.length > 1) {
    const paths = matches.map((m) => `${m.domainFolder}:${m.overlayPath}`).join("; ");
    throw new Error(`INTERPRETATION_OVERLAY_AMBIGUOUS:${paths}`);
  }
  return matches[0]!;
}
