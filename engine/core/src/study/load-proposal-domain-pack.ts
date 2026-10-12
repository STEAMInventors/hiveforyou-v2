import { readFileSync } from "node:fs";

import type { ProposalDomainPack } from "@hiveforyou/domain-pack";
import {
  computeProposalPackContentSha256,
  validateProposalDomainPack,
} from "@hiveforyou/domain-pack/pack-driven-reader";

import { packDrivenProposalPackPath } from "./agentic-reader-qualification.js";

export function loadProposalDomainPack(
  env: Record<string, string | undefined> = process.env,
): { pack: ProposalDomainPack; path: string; contentSha256: string } {
  const path = packDrivenProposalPackPath(env);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno?.code === "ENOENT") {
      throw new Error(`PACK_DRIVEN_PROPOSAL_PACK_MISSING:${path}`);
    }
    throw error;
  }
  const parsed = JSON.parse(raw) as ProposalDomainPack;
  const validation = validateProposalDomainPack(parsed);
  if (!validation.valid) {
    throw new Error(`PACK_DRIVEN_PROPOSAL_PACK_INVALID:${path}`);
  }
  return {
    pack: parsed,
    path,
    contentSha256: computeProposalPackContentSha256(parsed).toLowerCase(),
  };
}

/** Fail closed when Oracle/worker image sets HIVE_PACK_DRIVEN_READER_PROPOSAL_JSON. */
export function verifyPackDrivenProposalPackPackaged(
  env: Record<string, string | undefined> = process.env,
): void {
  const override = env.HIVE_PACK_DRIVEN_READER_PROPOSAL_JSON?.trim();
  if (!override) {
    return;
  }
  loadProposalDomainPack(env);
}
