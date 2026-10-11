import { readFileSync } from "node:fs";

import type { ClaimModality, ClaimValueV4 } from "@hiveforyou/shared/case-intelligence/4";
import type { GoldenCase, GoldenFact } from "../../../engine/eval/src/golden/types.js";
import type { GradeCorpusContext } from "../../../engine/eval/src/index.js";
import {
  buildReaderGoldenComparisonReport,
  classifyUnmatchedGoldenFactWithCandidate,
  findClosestCandidateForGoldenFact,
  parseAcceptedReaderFactsJson,
  type GoldenFactMatchStatus,
  type GoldenMismatchClassification,
  type PerGoldenFactRow,
  type ReaderExperimentCandidateFact,
} from "../../../engine/eval/src/reader-experiment/fact-match.js";

import type { InitialIepFactCatalog } from "./catalog-types.js";
import { initialIepGoldenFacts } from "./load-catalog.js";
import { PAGE3_GOLDEN_PAIR, reconcilePage3GoldenTargets } from "./page3-reconcile.js";

export type ExtractionModeLabel = "A" | "B" | "C";

const EXPECTED_MATCHED_BY_MODE: Record<ExtractionModeLabel, number> = {
  A: 16,
  B: 17,
  C: 17,
};

export function formatClaimValueForReport(value: ClaimValueV4): string {
  switch (value.kind) {
    case "text":
      return value.textValue ?? "";
    case "date":
      return value.dateValue ?? "";
    case "code":
      return value.codeValue ?? "";
    case "boolean":
      return String(value.booleanValue);
    case "quantity":
      return `${value.numberValue ?? ""}${value.unit ? ` ${value.unit}` : ""}`.trim();
    case "period":
      return `${value.periodStart ?? "?"} – ${value.periodEnd ?? "?"}`;
    case "entity_ref":
      return value.entityId ?? "";
    default:
      return JSON.stringify(value);
  }
}

function escapeMarkdownCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function formatExpectedModality(fact: GoldenFact): string {
  return fact.acceptableModalities.join(" | ");
}

function classificationToDiffLabel(classification: GoldenMismatchClassification): string {
  switch (classification) {
    case "TRUE_OMISSION":
      return "no accepted candidate with provenance overlap";
    case "VALUE_EXTRACTION_ERROR":
      return "value mismatch";
    case "MODALITY_EXTRACTION_ERROR":
      return "modality mismatch";
    case "EVIDENCE_ALIGNMENT_ERROR":
      return "evidence span mismatch (same page, no word-range overlap)";
    case "EQUIVALENT_VALUE_GRADER_MISMATCH":
      return "near-equivalent value; grader did not assign match";
    case "INDETERMINATE":
      return "overlapping candidate consumed by another golden or grader ordering";
    default:
      return classification;
  }
}

function graderStatusToDiffHint(status: GoldenFactMatchStatus): string | null {
  if (status === "overlap_value_mismatch") {
    return "value mismatch";
  }
  if (status === "overlap_modality_mismatch") {
    return "modality mismatch";
  }
  return null;
}

export function buildModeStatusLabel(input: {
  row: PerGoldenFactRow;
  fact: GoldenFact;
  candidates: ReaderExperimentCandidateFact[];
  corpus: GradeCorpusContext;
}): {
  status: "MATCHED" | "MISSED";
  display: string;
  matchedCandidateId: string | null;
  missDetail: Record<string, unknown> | null;
} {
  if (input.row.status === "matched") {
    return {
      status: "MATCHED",
      display: "MATCHED",
      matchedCandidateId: input.row.matchedCandidateId,
      missDetail: null,
    };
  }

  const candidatesById = new Map(input.candidates.map((c) => [c.id, c]));
  const { closest } = findClosestCandidateForGoldenFact({
    fact: input.fact,
    candidates: input.candidates,
    corpus: input.corpus,
  });

  if (!closest || closest.rankScore <= 0) {
    return {
      status: "MISSED",
      display: "MISSED — NOT EXTRACTED",
      matchedCandidateId: null,
      missDetail: { reason: "NOT EXTRACTED" },
    };
  }

  const candidate = candidatesById.get(closest.candidateId);
  const candidateValue = candidate?.value ?? null;
  const classified = classifyUnmatchedGoldenFactWithCandidate({
    fact: input.fact,
    graderStatus: input.row.status,
    closest,
    candidateValue,
  });
  const diff =
    graderStatusToDiffHint(input.row.status) ?? classificationToDiffLabel(classified.classification);
  const extractedValue = candidate ? formatClaimValueForReport(candidate.value) : "?";
  const page = closest.candidatePage ?? "?";

  const display = [
    "MISSED",
    `nearest: ${closest.candidateId}`,
    `value: ${extractedValue}`,
    `modality: ${closest.candidateModality}`,
    `page: ${page}`,
    `diff: ${diff}`,
  ].join("; ");

  return {
    status: "MISSED",
    display,
    matchedCandidateId: null,
    missDetail: {
      nearestCandidateId: closest.candidateId,
      extractedValue,
      modality: closest.candidateModality,
      page,
      diff,
      graderStatus: input.row.status,
      classification: classified.classification,
    },
  };
}

export type GoldenFactComparisonRow = {
  index: number;
  goldenFactId: string;
  constructMeaning: string;
  expectedValue: string;
  expectedModality: string;
  sourcePage: number;
  modes: Record<
    ExtractionModeLabel,
    {
      status: "MATCHED" | "MISSED";
      display: string;
      matchedCandidateId: string | null;
      missDetail: Record<string, unknown> | null;
    }
  >;
};

export type GoldenFactComparisonReport = {
  schemaVersion: "t3-9-ontology/golden-fact-comparison/1";
  generatedAt: string;
  goldenSource: string;
  initialIepFactCount: 29;
  modeInputs: Record<ExtractionModeLabel, string>;
  summary: {
    matchedByMode: Record<ExtractionModeLabel, number>;
    expectedMatchedByMode: Record<ExtractionModeLabel, number>;
    validationPassed: boolean;
    validationErrors: string[];
    matchedOnlyA: string[];
    matchedOnlyB: string[];
    matchedOnlyC: string[];
    matchedAllThree: string[];
    matchedNone: string[];
  };
  page3Reconciliation: Record<ExtractionModeLabel, ReturnType<typeof reconcilePage3GoldenTargets>>;
  rows: GoldenFactComparisonRow[];
};

export function loadAcceptedFactsFromFile(path: string): ReaderExperimentCandidateFact[] {
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return parseAcceptedReaderFactsJson(raw);
}

function buildInitialIepGoldenSlice(golden: GoldenCase): GoldenCase {
  return { ...golden, facts: initialIepGoldenFacts(golden) };
}

function gradeInitialIep(
  golden: GoldenCase,
  corpus: GradeCorpusContext,
  accepted: ReaderExperimentCandidateFact[],
) {
  return buildReaderGoldenComparisonReport({
    golden: buildInitialIepGoldenSlice(golden),
    candidates: accepted,
    corpus,
    verificationIncomplete: false,
  });
}

export function buildGoldenFactComparisonReport(input: {
  golden: GoldenCase;
  corpus: GradeCorpusContext;
  catalog: InitialIepFactCatalog;
  acceptedByMode: Record<ExtractionModeLabel, ReaderExperimentCandidateFact[]>;
  goldenSourcePath: string;
  modeInputPaths: Record<ExtractionModeLabel, string>;
  generatedAt?: string;
}): GoldenFactComparisonReport {
  const initialFacts = initialIepGoldenFacts(input.golden);
  if (initialFacts.length !== 29) {
    throw new Error(`Expected 29 Initial IEP golden facts; got ${initialFacts.length}.`);
  }

  const factsById = new Map(initialFacts.map((f) => [f.id, f]));
  const catalogById = new Map(input.catalog.entries.map((e) => [e.goldenFactId, e]));

  const reports = {
    A: gradeInitialIep(input.golden, input.corpus, input.acceptedByMode.A),
    B: gradeInitialIep(input.golden, input.corpus, input.acceptedByMode.B),
    C: gradeInitialIep(input.golden, input.corpus, input.acceptedByMode.C),
  };

  const perModeRows = {
    A: new Map(reports.A.perGoldenFact.map((r) => [r.goldenFactId, r])),
    B: new Map(reports.B.perGoldenFact.map((r) => [r.goldenFactId, r])),
    C: new Map(reports.C.perGoldenFact.map((r) => [r.goldenFactId, r])),
  };

  const matchedByMode: Record<ExtractionModeLabel, number> = {
    A: reports.A.summary.matchedGoldenCount,
    B: reports.B.summary.matchedGoldenCount,
    C: reports.C.summary.matchedGoldenCount,
  };

  const validationErrors: string[] = [];
  for (const mode of ["A", "B", "C"] as const) {
    const expected = EXPECTED_MATCHED_BY_MODE[mode];
    const actual = matchedByMode[mode];
    if (actual !== expected) {
      validationErrors.push(
        `Mode ${mode}: per-golden MATCHED row count is ${actual}/29 but saved metrics expect ${expected}/29 (grader recall ${reports[mode].summary.recall}).`,
      );
    }
  }

  const rows: GoldenFactComparisonRow[] = input.catalog.entries.map((entry, index) => {
    const fact = factsById.get(entry.goldenFactId);
    if (!fact) {
      throw new Error(`Golden fact missing for catalog entry ${entry.goldenFactId}`);
    }
    const constructMeaning = entry.description ?? entry.atomicField;

    const modes = {} as GoldenFactComparisonRow["modes"];
    for (const mode of ["A", "B", "C"] as const) {
      const row = perModeRows[mode].get(entry.goldenFactId);
      if (!row) {
        throw new Error(`Grader row missing for ${entry.goldenFactId} mode ${mode}`);
      }
      modes[mode] = buildModeStatusLabel({
        row,
        fact,
        candidates: input.acceptedByMode[mode],
        corpus: input.corpus,
      });
    }

    return {
      index: index + 1,
      goldenFactId: entry.goldenFactId,
      constructMeaning,
      expectedValue: formatClaimValueForReport(fact.value),
      expectedModality: formatExpectedModality(fact),
      sourcePage: fact.pageNumber,
      modes,
    };
  });

  const matchedOnlyA: string[] = [];
  const matchedOnlyB: string[] = [];
  const matchedOnlyC: string[] = [];
  const matchedAllThree: string[] = [];
  const matchedNone: string[] = [];

  for (const row of rows) {
    const a = row.modes.A.status === "MATCHED";
    const b = row.modes.B.status === "MATCHED";
    const c = row.modes.C.status === "MATCHED";
    if (a && !b && !c) {
      matchedOnlyA.push(row.goldenFactId);
    } else if (!a && b && !c) {
      matchedOnlyB.push(row.goldenFactId);
    } else if (!a && !b && c) {
      matchedOnlyC.push(row.goldenFactId);
    } else if (a && b && c) {
      matchedAllThree.push(row.goldenFactId);
    } else if (!a && !b && !c) {
      matchedNone.push(row.goldenFactId);
    }
  }

  const page3Reconciliation = {
    A: reconcilePage3GoldenTargets({
      golden: input.golden,
      corpus: input.corpus,
      accepted: input.acceptedByMode.A,
    }),
    B: reconcilePage3GoldenTargets({
      golden: input.golden,
      corpus: input.corpus,
      accepted: input.acceptedByMode.B,
    }),
    C: reconcilePage3GoldenTargets({
      golden: input.golden,
      corpus: input.corpus,
      accepted: input.acceptedByMode.C,
    }),
  };

  return {
    schemaVersion: "t3-9-ontology/golden-fact-comparison/1",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    goldenSource: input.goldenSourcePath,
    initialIepFactCount: 29,
    modeInputs: input.modeInputPaths,
    summary: {
      matchedByMode,
      expectedMatchedByMode: { ...EXPECTED_MATCHED_BY_MODE },
      validationPassed: validationErrors.length === 0,
      validationErrors,
      matchedOnlyA,
      matchedOnlyB,
      matchedOnlyC,
      matchedAllThree,
      matchedNone,
    },
    page3Reconciliation,
    rows,
  };
}

export function renderGoldenFactComparisonMarkdown(report: GoldenFactComparisonReport): string {
  const lines: string[] = [
    "# T3.9 Ontology — Initial IEP golden fact comparison (Modes A, B, C)",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `Golden source: \`${report.goldenSource}\``,
    "",
  ];

  if (!report.summary.validationPassed) {
    lines.push("## VALIDATION FAILED", "");
    for (const err of report.summary.validationErrors) {
      lines.push(`- ${err}`);
    }
    lines.push("");
  }

  lines.push(
    "## Summary",
    "",
    "| Mode | MATCHED | Expected |",
    "| --- | ---: | ---: |",
    ...(["A", "B", "C"] as const).map(
      (m) =>
        `| ${m} | ${report.summary.matchedByMode[m]}/29 | ${report.summary.expectedMatchedByMode[m]}/29 |`,
    ),
    "",
    "| Set | Count | Fact IDs |",
    "| --- | ---: | --- |",
    `| A-only | ${report.summary.matchedOnlyA.length} | ${report.summary.matchedOnlyA.join(", ") || "—"} |`,
    `| B-only | ${report.summary.matchedOnlyB.length} | ${report.summary.matchedOnlyB.join(", ") || "—"} |`,
    `| C-only | ${report.summary.matchedOnlyC.length} | ${report.summary.matchedOnlyC.join(", ") || "—"} |`,
    `| All three | ${report.summary.matchedAllThree.length} | ${report.summary.matchedAllThree.join(", ") || "—"} |`,
    `| None | ${report.summary.matchedNone.length} | ${report.summary.matchedNone.join(", ") || "—"} |`,
    "",
    "## Page 3 reconciliation (`clm_iep_addresses`, `clm_goal_area`)",
    "",
    `Shared golden word span note: ${PAGE3_GOLDEN_PAIR.join(" + ")} on page 3.`,
    "",
    "| Mode | Accepted on page 3 | `clm_iep_addresses` | `clm_goal_area` |",
    "| --- | ---: | --- | --- |",
  );

  for (const mode of ["A", "B", "C"] as const) {
    const p3 = report.page3Reconciliation[mode];
    lines.push(
      `| ${mode} | ${p3.acceptedProposalCountOnPage3} | ${p3.goldenMatched.clm_iep_addresses ? "MATCHED" : "MISSED"} | ${p3.goldenMatched.clm_goal_area ? "MATCHED" : "MISSED"} |`,
    );
  }

  lines.push("", p3Notes(report), "", "## Side-by-side facts (29 Initial IEP)", "", "| # | Golden fact ID | Construct / meaning | Expected value | Expected modality | Source page | A status | B status | C status |", "| ---: | --- | --- | --- | --- | ---: | --- | --- | --- |");

  for (const row of report.rows) {
    lines.push(
      `| ${row.index} | ${row.goldenFactId} | ${escapeMarkdownCell(row.constructMeaning)} | ${escapeMarkdownCell(row.expectedValue)} | ${escapeMarkdownCell(row.expectedModality)} | ${row.sourcePage} | ${escapeMarkdownCell(row.modes.A.display)} | ${escapeMarkdownCell(row.modes.B.display)} | ${escapeMarkdownCell(row.modes.C.display)} |`,
    );
  }

  lines.push("");
  return lines.join("\n");
}

function p3Notes(report: GoldenFactComparisonReport): string {
  const notes = new Set<string>();
  for (const mode of ["A", "B", "C"] as const) {
    notes.add(report.page3Reconciliation[mode].notes);
  }
  return [...notes].join(" ");
}
