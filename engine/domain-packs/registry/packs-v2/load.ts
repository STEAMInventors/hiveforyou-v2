import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import { PackValidationFailedError } from "./errors";
import type { CoreDefaultsV2, DomainPackV2 } from "./types";
import { validateCoreDefaultsDocument } from "./validate-core-defaults";
import { validateDomainPackDocument } from "./validate-domain-pack";

/** pack id → YAML filename under packs-v2/ */
const PACK_ID_TO_FILE: Record<string, string> = {
  iep: "iep.yaml",
  bankruptcy: "bankruptcy.yaml",
  long_term_care_medicaid: "medicaid.yaml",
  // Questions-only defaults file (not core_defaults.yaml behaviors).
  core_defaults: "core_default_questions.yaml",
};

const DOMAIN_PACK_IDS = ["iep", "bankruptcy", "long_term_care_medicaid"] as const;

const CORE_DEFAULTS_BEHAVIORS_FILE = "core_defaults.yaml";

type CacheEntry<T> = { hash: string; value: T };

const fileCache = new Map<string, CacheEntry<unknown>>();

function defaultPacksV2Dir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../../packs-v2");
}

function readAndParseYaml(packsV2Dir: string, filename: string): unknown {
  const absolutePath = join(packsV2Dir, filename);
  const bytes = readFileSync(absolutePath);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const cached = fileCache.get(absolutePath);
  if (cached && cached.hash === hash) {
    return cached.value;
  }
  const text = bytes.toString("utf8");
  const doc = parse(text);
  fileCache.set(absolutePath, { hash, value: doc });
  return doc;
}


export function loadPack(
  packId: string,
  packsV2Dir: string = defaultPacksV2Dir(),
): DomainPackV2 {
  const filename = PACK_ID_TO_FILE[packId];
  if (!filename) {
    throw new Error(`Unknown pack id: ${packId}`);
  }
  const doc = readAndParseYaml(packsV2Dir, filename);
  const result = validateDomainPackDocument(doc, filename);
  if (!result.ok) {
    throw new PackValidationFailedError(result.errors);
  }
  return result.pack;
}

/** Domain packs only (excludes core_defaults questions file). Runs global distinctive document_types check. */
export function loadAllPacks(packsV2Dir: string = defaultPacksV2Dir()): DomainPackV2[] {
  const distinctiveOwner = new Map<string, string>();
  const errors: import("./errors").PackValidationError[] = [];
  const packs: DomainPackV2[] = [];

  for (const packId of DOMAIN_PACK_IDS) {
    const filename = PACK_ID_TO_FILE[packId]!;
    const doc = readAndParseYaml(packsV2Dir, filename);
    const result = validateDomainPackDocument(doc, filename, { distinctiveOwner });
    if (!result.ok) {
      errors.push(...result.errors);
    } else {
      packs.push(result.pack);
    }
  }

  if (errors.length > 0) {
    throw new PackValidationFailedError(errors);
  }

  return packs;
}

/** Attribute behaviors from core_defaults.yaml (not core_default_questions.yaml). */
export function loadCoreDefaults(packsV2Dir: string = defaultPacksV2Dir()): CoreDefaultsV2 {
  const doc = readAndParseYaml(packsV2Dir, CORE_DEFAULTS_BEHAVIORS_FILE);
  const result = validateCoreDefaultsDocument(doc, CORE_DEFAULTS_BEHAVIORS_FILE);
  if (!result.ok) {
    throw new PackValidationFailedError(result.errors);
  }
  return result.coreDefaults;
}

/** @internal test hook */
export function clearPackFileCacheForTests(): void {
  fileCache.clear();
}

export function packsV2Directory(): string {
  return defaultPacksV2Dir();
}
