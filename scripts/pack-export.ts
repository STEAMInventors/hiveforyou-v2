import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  DomainPack,
  DomainPackVocabularyTerm,
  StudyAgentInstructions,
} from "@hiveforyou/domain-pack";
import { getDomainPackByDomainId } from "@hiveforyou/domain-pack";
import "@hiveforyou/domain-packs";

export const STUDY_AGENTS_EXPORT_SCHEMA_VERSION = "study-agents/1" as const;

export const STUDY_AGENT_ROLES = ["intake", "reader", "investigator", "writer"] as const;

export type StudyAgentRole = (typeof STUDY_AGENT_ROLES)[number];

export type ReaderCoverageVocabularyTerm = {
  termId: string;
  label: string;
  abbreviations?: string[];
  contextRequired?: boolean;
};

/** Pack-derived Reader orientation (document types, constructs, vocabulary — not evidence). */
export type ReaderCoverageExport = {
  domainLabel: string;
  documentTypes: string[];
  familyRoles: string[];
  relationshipKinds: string[];
  focusConstructs: string[];
  vocabulary: ReaderCoverageVocabularyTerm[];
};

export type StudyAgentsExportArtifact = {
  schemaVersion: typeof STUDY_AGENTS_EXPORT_SCHEMA_VERSION;
  domainId: string;
  domainPackId: string;
  domainPackVersion: string;
  readerCoverage: ReaderCoverageExport;
  agents: StudyAgentInstructions;
};

function serializeVocabularyTerm(term: DomainPackVocabularyTerm): ReaderCoverageVocabularyTerm {
  const out: ReaderCoverageVocabularyTerm = {
    termId: term.termId,
    label: term.label,
  };
  if (term.abbreviations?.length) {
    out.abbreviations = [...term.abbreviations];
  }
  if (term.contextRequired) {
    out.contextRequired = true;
  }
  return out;
}

export function buildReaderCoverageExport(pack: DomainPack, domainId: string): ReaderCoverageExport {
  const study = pack.study;
  if (!study) {
    throw new Error(`Domain pack "${domainId}" has no study snapshot.`);
  }
  const discover = pack.discover;
  if (!discover) {
    throw new Error(`Domain pack "${domainId}" has no discover snapshot for readerCoverage.`);
  }
  const vocabulary = pack.recognitionVocabulary ?? [];
  return {
    domainLabel: study.domainLabel,
    documentTypes: [...discover.documentTypes],
    familyRoles: [...discover.familyRoles],
    relationshipKinds: [...discover.relationshipKinds],
    focusConstructs: [...(study.focusConstructs ?? [])],
    vocabulary: vocabulary.map(serializeVocabularyTerm),
  };
}

const SAFE_DOMAIN_ID = /^[a-z][a-z0-9-]*$/;

export function assertSafeDomainId(domainId: string): void {
  const trimmed = domainId.trim();
  if (!trimmed || trimmed !== domainId) {
    throw new Error(
      `Invalid domain id "${domainId}": must be a non-empty trimmed stable identifier.`,
    );
  }
  if (trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error(`Invalid domain id "${domainId}": path traversal is not allowed.`);
  }
  if (!SAFE_DOMAIN_ID.test(trimmed)) {
    throw new Error(
      `Invalid domain id "${domainId}": use lowercase letters, digits, and hyphens only.`,
    );
  }
}

export function validateStudyAgentInstructions(
  agents: StudyAgentInstructions | undefined,
  domainId: string,
): StudyAgentInstructions {
  if (!agents) {
    throw new Error(`Domain pack "${domainId}" has no study.agents instructions.`);
  }
  for (const role of STUDY_AGENT_ROLES) {
    const value = agents[role];
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(
        `Domain pack "${domainId}" study.agents.${role} must be a non-empty string.`,
      );
    }
  }
  return agents;
}

export function buildStudyAgentsExportArtifact(
  pack: DomainPack,
  domainId: string,
): StudyAgentsExportArtifact {
  assertSafeDomainId(domainId);
  if (pack.manifest.id !== domainId) {
    throw new Error(
      `Domain pack manifest id "${pack.manifest.id}" does not match requested domain "${domainId}".`,
    );
  }
  const study = pack.study;
  if (!study) {
    throw new Error(`Domain pack "${domainId}" has no study snapshot.`);
  }
  const agents = validateStudyAgentInstructions(study.agents, domainId);
  const readerCoverage = buildReaderCoverageExport(pack, domainId);
  return {
    schemaVersion: STUDY_AGENTS_EXPORT_SCHEMA_VERSION,
    domainId: study.domainId,
    domainPackId: study.domainPackId,
    domainPackVersion: study.domainPackVersion,
    readerCoverage,
    agents: {
      intake: agents.intake,
      reader: agents.reader,
      investigator: agents.investigator,
      writer: agents.writer,
    },
  };
}

export function resolveStudyAgentsExport(domainId: string): StudyAgentsExportArtifact {
  assertSafeDomainId(domainId);
  const pack = getDomainPackByDomainId(domainId);
  if (!pack) {
    throw new Error(`No domain pack is registered for "${domainId}".`);
  }
  return buildStudyAgentsExportArtifact(pack, domainId);
}

export function serializeStudyAgentsExportJson(artifact: StudyAgentsExportArtifact): string {
  const ordered = {
    schemaVersion: artifact.schemaVersion,
    domainId: artifact.domainId,
    domainPackId: artifact.domainPackId,
    domainPackVersion: artifact.domainPackVersion,
    readerCoverage: artifact.readerCoverage,
    agents: {
      intake: artifact.agents.intake,
      reader: artifact.agents.reader,
      investigator: artifact.agents.investigator,
      writer: artifact.agents.writer,
    },
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

export function defaultRepoRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}

export function studyAgentsExportOutputPath(repoRoot: string, domainId: string): string {
  assertSafeDomainId(domainId);
  return join(repoRoot, "engine", "domain-packs", domainId, "study", "agents.json");
}

export function writeStudyAgentsExport(
  domainId: string,
  options?: { repoRoot?: string },
): { artifact: StudyAgentsExportArtifact; outputPath: string; json: string } {
  const artifact = resolveStudyAgentsExport(domainId);
  const json = serializeStudyAgentsExportJson(artifact);
  const repoRoot = options?.repoRoot ?? defaultRepoRoot();
  const outputPath = studyAgentsExportOutputPath(repoRoot, domainId);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, json, "utf8");
  return { artifact, outputPath, json };
}

function main(): void {
  const domainId = process.argv[2];
  if (!domainId || process.argv.length > 3) {
    console.error("Usage: tsx scripts/pack-export.ts <domainId>");
    process.exit(1);
  }
  try {
    const { outputPath } = writeStudyAgentsExport(domainId);
    console.log(`Wrote ${outputPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}

function isCliEntry(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch {
    return false;
  }
}

if (isCliEntry()) {
  main();
}
