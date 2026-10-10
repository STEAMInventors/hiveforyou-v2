import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { readerAcceptedFactsStoragePath } from "@hiveforyou/shared/hive-artifact-paths";
import {
  parseReaderAcceptedFactsArtifact,
  type ReaderAcceptedFactsArtifact,
} from "@hiveforyou/shared/reader-accepted-facts";
import { createClient } from "@supabase/supabase-js";

import type { GradeCorpusContext } from "../grade.js";
import type { GoldenCase } from "../golden/types.js";
import {
  assessStudyRunGradeability,
  buildReaderGoldenComparisonReport,
  parseAcceptedReaderFactsJson,
  type ReaderExperimentCandidateFact,
  type ReaderGoldenComparisonReport,
  type ReaderTraceEventRow,
  type StudyRunGradeabilityAssessment,
} from "./fact-match.js";

export type ReaderAcceptedFactsLoadResult = {
  facts: ReaderExperimentCandidateFact[];
  artifact: ReaderAcceptedFactsArtifact | null;
  source: "file" | "storage" | null;
  factsPath: string | null;
};

export function resolveAcceptedFactsFilePath(input: {
  repoRoot: string;
  studyRunId: string;
  factsDir?: string;
  explicitPath?: string;
}): string | null {
  if (input.explicitPath) {
    return join(input.repoRoot, input.explicitPath);
  }
  if (input.factsDir) {
    const candidate = join(input.repoRoot, input.factsDir, `${input.studyRunId}.json`);
    return existsSync(candidate) ? candidate : null;
  }
  return null;
}

export function loadAcceptedFactsFromResolvedPath(path: string): ReaderAcceptedFactsLoadResult {
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const artifact =
    raw && typeof raw === "object" && (raw as { schemaVersion?: string }).schemaVersion === "reader-accepted-facts/1"
      ? parseReaderAcceptedFactsArtifact(raw)
      : null;
  return {
    facts: parseAcceptedReaderFactsJson(raw),
    artifact,
    source: "file",
    factsPath: path,
  };
}

export async function loadReaderAcceptedFactsForStudyRun(input: {
  repoRoot: string;
  studyRunId: string;
  factsDir?: string;
  explicitPath?: string;
  env: Record<string, string>;
}): Promise<ReaderAcceptedFactsLoadResult> {
  const filePath = resolveAcceptedFactsFilePath({
    repoRoot: input.repoRoot,
    studyRunId: input.studyRunId,
    factsDir: input.factsDir,
    explicitPath: input.explicitPath,
  });
  if (filePath) {
    try {
      return loadAcceptedFactsFromResolvedPath(filePath);
    } catch {
      return { facts: [], artifact: null, source: null, factsPath: null };
    }
  }

  const url = input.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = input.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    return { facts: [], artifact: null, source: null, factsPath: null };
  }

  const sb = createClient(url, key, { db: { schema: "hive" } });
  const { data: runRow, error: runError } = await sb
    .from("study_runs")
    .select("user_id")
    .eq("id", input.studyRunId)
    .maybeSingle();
  if (runError || !runRow?.user_id) {
    return { facts: [], artifact: null, source: null, factsPath: null };
  }

  const bucket = input.env.HIVE_DOCUMENT_PAGES_BUCKET?.trim() || "document-pages";
  const objectPath = readerAcceptedFactsStoragePath(String(runRow.user_id), input.studyRunId);
  const { data: blob, error: downloadError } = await sb.storage.from(bucket).download(objectPath);
  if (downloadError || !blob) {
    return { facts: [], artifact: null, source: null, factsPath: null };
  }

  const raw = JSON.parse(await blob.text()) as unknown;
  const artifact = parseReaderAcceptedFactsArtifact(raw);
  return {
    facts: parseAcceptedReaderFactsJson(raw),
    artifact,
    source: "storage",
    factsPath: `supabase://${bucket}/${objectPath}`,
  };
}

export function gradeStudyRunAgainstGolden(input: {
  golden: GoldenCase;
  corpus: GradeCorpusContext;
  studyRunId: string;
  traceEvents: ReaderTraceEventRow[];
  accepted: ReaderAcceptedFactsLoadResult;
}): {
  gradeability: StudyRunGradeabilityAssessment;
  comparison: ReaderGoldenComparisonReport | null;
} {
  const gradeability = assessStudyRunGradeability({
    studyRunId: input.studyRunId,
    traceEvents: input.traceEvents,
    acceptedFactsFilePresent: input.accepted.source !== null,
    attemptId: input.accepted.artifact?.attemptId ?? null,
  });

  const comparison =
    input.accepted.source !== null
      ? buildReaderGoldenComparisonReport({
          golden: input.golden,
          candidates: input.accepted.facts,
          corpus: input.corpus,
        })
      : null;

  return { gradeability, comparison };
}