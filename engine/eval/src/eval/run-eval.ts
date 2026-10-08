import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { GoldenSplit } from "../golden/types.js";
import { gradeGoldenProposal } from "../grade.js";
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
