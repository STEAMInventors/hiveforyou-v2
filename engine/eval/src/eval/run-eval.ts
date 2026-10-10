import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { GoldenSplit } from "../golden/types.js";
import { assertCertifiedGolden, gradeGoldenProposal } from "../grade.js";
import { baselineCaseIdForGolden } from "./baseline-case-id.js";
import { baselineProposalLimits, proposalFromStudyBaseline } from "./baseline-proposal.js";
import type { StudyBaseline } from "./baseline-types.js";
import { loadGradeCorpusForGolden } from "./load-grade-corpus.js";
import {
  renderComparisonReport,
  renderEvalReport,
  type CaseEvalResult,
  type EvalRunSummary,
} from "./report.js";
import { listGoldensForSplit } from "./select-goldens.js";
import { createClient } from "@supabase/supabase-js";

import { validateGoldenCase } from "../golden/validate.js";
import type { GoldenCase } from "../golden/types.js";
import type { ReaderTraceEventRow } from "../reader-experiment/fact-match.js";
import {
  gradeStudyRunAgainstGolden,
  loadReaderAcceptedFactsForStudyRun,
} from "../reader-experiment/golden-comparison.js";

export type ParsedEvalSource = {
  label: string;
  promptVersion: string;
};

export function parseEvalSource(sourceArg: string): ParsedEvalSource {
  const normalized = sourceArg.replace(/\\/g, "/").replace(/^\/+/, "");
  const match = normalized.match(/^(?:baselines\/)?(v4(?:\.1)?)$/);
  if (!match) {
    throw new Error(`Unsupported --source ${sourceArg}; expected baselines/v4 or baselines/v4.1`);
  }
  const promptVersion = match[1]!;
  return { label: `baselines/${promptVersion}`, promptVersion };
}

export function baselineFilePath(input: {
  repoRoot: string;
  goldenCaseId: string;
  promptVersion: string;
}): string {
  const baselineCaseId = baselineCaseIdForGolden(input.goldenCaseId);
  return join(input.repoRoot, "engine/eval/baselines", `${baselineCaseId}-${input.promptVersion}.json`);
}

function baselineNote(): string {
  const limits = baselineProposalLimits();
  return `Baseline replay uses acceptedClaims only; not persisted in T0.2: ${limits.missingFields.join(", ")}. Gap/abstention and conflict tripwires may reflect empty missingInformation/conflicts arrays.`;
}

export async function runEvalForSource(input: {
  repoRoot: string;
  evalRoot: string;
  split: GoldenSplit;
  source: ParsedEvalSource;
  generatedIso: string;
  loadCorpus?: typeof loadGradeCorpusForGolden;
}): Promise<EvalRunSummary> {
  const loadCorpus = input.loadCorpus ?? loadGradeCorpusForGolden;
  const { goldens, skipped } = listGoldensForSplit({ evalRoot: input.evalRoot, split: input.split });
  const casesScored: CaseEvalResult[] = [];

  for (const golden of goldens) {
    const baselinePath = baselineFilePath({
      repoRoot: input.repoRoot,
      goldenCaseId: golden.caseId,
      promptVersion: input.source.promptVersion,
    });
    if (!existsSync(baselinePath)) {
      skipped.push({
        caseId: golden.caseId,
        file: `${golden.caseId}.json`,
        reason: "no_matching_baseline",
        detail: baselinePath.replace(/\\/g, "/"),
      });
      continue;
    }

    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as StudyBaseline;
    const proposal = proposalFromStudyBaseline(baseline);
    const corpus = await loadCorpus({
      repoRoot: input.repoRoot,
      goldenCaseId: golden.caseId,
      corpusDirRel: golden.corpusDir,
    });
    const grade = gradeGoldenProposal({ golden, proposal, corpus });
    casesScored.push({
      caseId: golden.caseId,
      grade,
      baselinePath: baselinePath.replace(/\\/g, "/").replace(`${input.repoRoot.replace(/\\/g, "/")}/`, ""),
      baselineRunStatus: baseline.runStatus,
      baselineValidationStatus: baseline.validationStatus ?? undefined,
      acceptedClaimCount: baseline.acceptedClaims?.length ?? 0,
    });
  }

  return {
    source: input.source.label,
    split: input.split,
    generatedIso: input.generatedIso,
    casesScored,
    skipped,
    baselineNote: baselineNote(),
  };
}

export function reportFilename(date: string, sourceLabel: string): string {
  const slug = sourceLabel.replace(/\//g, "-");
  return `${date}-${slug}.md`;
}

export async function runEvalCli(input: {
  repoRoot: string;
  evalRoot: string;
  split: GoldenSplit;
  sourceArg: string;
  compareSourceArg?: string;
  reportsDir: string;
  generatedIso: string;
  loadCorpus?: typeof loadGradeCorpusForGolden;
}): Promise<{ reportPaths: string[] }> {
  const source = parseEvalSource(input.sourceArg);
  mkdirSync(input.reportsDir, { recursive: true });

  const date = input.generatedIso.slice(0, 10);
  const summary = await runEvalForSource({
    repoRoot: input.repoRoot,
    evalRoot: input.evalRoot,
    split: input.split,
    source,
    generatedIso: input.generatedIso,
    loadCorpus: input.loadCorpus,
  });

  const reportPaths: string[] = [];
  const mainPath = join(input.reportsDir, reportFilename(date, source.label));
  writeFileSync(mainPath, renderEvalReport(summary), "utf8");
  reportPaths.push(mainPath);

  if (input.compareSourceArg) {
    const right = parseEvalSource(input.compareSourceArg);
    const rightSummary = await runEvalForSource({
      repoRoot: input.repoRoot,
      evalRoot: input.evalRoot,
      split: input.split,
      source: right,
      generatedIso: input.generatedIso,
      loadCorpus: input.loadCorpus,
    });

    const leftByCase = new Map(summary.casesScored.map((c) => [c.caseId, c]));
    const rows = rightSummary.casesScored
      .filter((r) => leftByCase.has(r.caseId))
      .map((r) => {
        const l = leftByCase.get(r.caseId)!;
        return {
          caseId: r.caseId,
          left: { score: l.grade.score, ...l.grade.metrics },
          right: { score: r.grade.score, ...r.grade.metrics },
        };
      });

    const comparePath = join(
      input.reportsDir,
      `${date}-${source.label.replace(/\//g, "-")}-vs-${right.label.replace(/\//g, "-")}.md`,
    );
    writeFileSync(
      comparePath,
      renderComparisonReport({
        leftSource: source.label,
        rightSource: right.label,
        split: input.split,
        generatedIso: input.generatedIso,
        rows,
      }),
      "utf8",
    );
    reportPaths.push(comparePath);
  }

  return { reportPaths };
}

export type ReaderGoldenCompareRunSpec = { label: string; studyRunId: string; factsPath?: string };

function loadDotEnvFile(absPath: string): Record<string, string> {
  if (!existsSync(absPath)) {
    throw new Error(`Env file not found: ${absPath}`);
  }
  const out: Record<string, string> = {};
  for (const line of readFileSync(absPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
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
    out[key] = value;
  }
  return out;
}

async function loadReaderTraceEvents(
  env: Record<string, string>,
  studyRunId: string,
): Promise<ReaderTraceEventRow[]> {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    return [];
  }
  const sb = createClient(url, key, { db: { schema: "hive" } });
  const { data, error } = await sb
    .from("agent_run_trace_events")
    .select("event_type,event_payload,attempt_id,sequence_number")
    .eq("study_run_id", studyRunId)
    .order("sequence_number", { ascending: true });
  if (error) {
    throw new Error(`Supabase trace load failed for ${studyRunId}: ${error.message}`);
  }
  return (data ?? []) as ReaderTraceEventRow[];
}

export async function runReaderGoldenCompareCli(input: {
  repoRoot: string;
  argv: string[];
  env?: Record<string, string | undefined>;
}): Promise<{ outPath: string }> {
  let goldenPath = "engine/eval/golden/tune/l001.json";
  const runs: ReaderGoldenCompareRunSpec[] = [];
  let factsDir: string | undefined;
  let supabaseEnvFile: string | undefined;
  let outPath = "engine/eval/reports/reader-experiment/l001-a-a2-b-comparison.json";

  for (let i = 0; i < input.argv.length; i += 1) {
    const arg = input.argv[i]!;
    if (arg === "--golden") {
      goldenPath = input.argv[++i] ?? goldenPath;
    } else if (arg === "--run") {
      const spec = input.argv[++i] ?? "";
      const colon = spec.indexOf(":");
      if (colon <= 0) {
        throw new Error(`Invalid --run ${spec}`);
      }
      runs.push({ label: spec.slice(0, colon), studyRunId: spec.slice(colon + 1) });
    } else if (arg === "--facts-dir") {
      factsDir = input.argv[++i];
    } else if (arg === "--facts") {
      const spec = input.argv[++i] ?? "";
      const colon = spec.indexOf(":");
      if (colon <= 0) {
        throw new Error(`Invalid --facts ${spec}`);
      }
      const label = spec.slice(0, colon);
      const path = spec.slice(colon + 1);
      const existing = runs.find((r) => r.label === label);
      if (existing) {
        existing.factsPath = path;
      }
    } else if (arg === "--supabase-env") {
      supabaseEnvFile = input.argv[++i];
    } else if (arg === "--out") {
      outPath = input.argv[++i] ?? outPath;
    }
  }

  if (runs.length === 0) {
    throw new Error("At least one --run Label:studyRunId is required");
  }

  const goldenParsed = validateGoldenCase(
    JSON.parse(readFileSync(join(input.repoRoot, goldenPath), "utf8")) as unknown,
  );
  if (!goldenParsed.ok) {
    throw new Error(
      `Golden validation failed: ${goldenParsed.issues.map((issue) => issue.message).join("; ")}`,
    );
  }
  const goldenRaw = goldenParsed.value;
  assertCertifiedGolden(goldenRaw);

  const corpus = await loadGradeCorpusForGolden({
    repoRoot: input.repoRoot,
    goldenCaseId: goldenRaw.caseId,
    corpusDirRel: goldenRaw.corpusDir,
  });

  const env: Record<string, string> = {
    ...(supabaseEnvFile ? loadDotEnvFile(join(input.repoRoot, supabaseEnvFile)) : {}),
  };
  if (input.env) {
    for (const [key, value] of Object.entries(input.env)) {
      if (value !== undefined) {
        env[key] = value;
      }
    }
  }

  const report: Record<string, unknown> = {
    schemaVersion: "reader-golden-comparison/1",
    generatedAt: new Date().toISOString(),
    golden: { caseId: goldenRaw.caseId, path: goldenPath, factCount: goldenRaw.facts.length },
    runs: {} as Record<string, unknown>,
  };

  for (const run of runs) {
    const accepted = await loadReaderAcceptedFactsForStudyRun({
      repoRoot: input.repoRoot,
      studyRunId: run.studyRunId,
      factsDir,
      explicitPath: run.factsPath,
      env,
    });
    const traceEvents = await loadReaderTraceEvents(env, run.studyRunId);
    const graded = gradeStudyRunAgainstGolden({
      golden: goldenRaw,
      corpus,
      studyRunId: run.studyRunId,
      traceEvents,
      accepted,
    });

    const runEntry: Record<string, unknown> = {
      label: run.label,
      studyRunId: run.studyRunId,
      gradeability: graded.gradeability,
      factsPath: accepted.factsPath,
      acceptedFactsSource: accepted.source,
      attemptId: accepted.artifact?.attemptId ?? graded.gradeability.traceAudit?.attemptId ?? null,
    };

    if (graded.comparison) {
      runEntry.comparison = graded.comparison;
    }

    (report.runs as Record<string, unknown>)[run.label] = runEntry;
  }

  const outAbs = join(input.repoRoot, outPath);
  mkdirSync(dirname(outAbs), { recursive: true });
  writeFileSync(outAbs, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  return { outPath };
}
