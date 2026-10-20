import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { DomainPackRegistryEntry } from "@hiveforyou/shared/domain-pack-registry";

import { hiveMonorepoRoot } from "../resolve-hive-monorepo-root.js";
import {
  createInMemoryDomainPackRegistry,
  type DomainPackRegistryPort,
} from "./resolve-domain-pack-registry.js";

function parseSeedEntries(raw: string, path: string): DomainPackRegistryEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`DOMAIN_PACK_REGISTRY_SEED_INVALID:${path}:json`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`DOMAIN_PACK_REGISTRY_SEED_INVALID:${path}:array`);
  }
  return parsed as DomainPackRegistryEntry[];
}

export function defaultDomainPackRegistrySeedPath(
  env: Record<string, string | undefined> = process.env,
): string {
  const override = env.HIVE_DOMAIN_PACK_REGISTRY_SEED_JSON?.trim();
  if (override) {
    return override;
  }
  return join(hiveMonorepoRoot(), "engine", "core", "fixtures", "domain-pack-registry-iep-seed.json");
}

export function loadDefaultDomainPackRegistrySeed(
  env: Record<string, string | undefined> = process.env,
): DomainPackRegistryEntry[] {
  const path = defaultDomainPackRegistrySeedPath(env);
  const raw = readFileSync(path, "utf8");
  return parseSeedEntries(raw, path);
}

export function createDefaultDomainPackRegistryPort(
  env: Record<string, string | undefined> = process.env,
): DomainPackRegistryPort {
  return createInMemoryDomainPackRegistry(loadDefaultDomainPackRegistrySeed(env));
}
