import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { AssembledDocument } from "./assembly";
import { assembleDocument } from "./assembly";
import type { BBox, DocumentPages, PageModel, PageWord } from "./page-model";

const intakeFixtures = join(dirname(fileURLToPath(import.meta.url)), "../../../intake/fixtures/l001");

type DocumentPagesSnapshot = {
  sourcePdfFileName: string;
  sourcePdfSha256: string;
  documentPages: DocumentPages;
};

function loadSnapshot(name: string): DocumentPagesSnapshot {
  return JSON.parse(
    readFileSync(join(intakeFixtures, "document-pages", name), "utf8"),
  ) as DocumentPagesSnapshot;
}

function assertLosslessWordIndices(assembled: AssembledDocument, page: PageModel): void {
  const seen = new Map<number, "segment" | "cell">();
  const tableBlockIds = new Set(
    assembled.blocks
      .filter((b) => b.pageNumber === page.pageNumber && b.kind === "table")
      .map((b) => b.id),
  );
  for (const block of assembled.blocks) {
    if (block.pageNumber !== page.pageNumber) {
      continue;
    }
    if (block.parentBlockId != null && tableBlockIds.has(block.parentBlockId)) {
      continue;
    }
    for (const segment of block.segments) {
      for (let i = segment.wordRange[0]; i < segment.wordRange[1]; i += 1) {
        expect(seen.has(i), `duplicate word index ${i} in segments`).toBe(false);
        seen.set(i, "segment");
      }
    }
  }
  for (const cell of assembled.cells) {
    const block = assembled.blocks.find((b) => b.id === cell.blockId);
    if (!block || block.pageNumber !== page.pageNumber) {
      continue;
    }
    for (let i = 0; i < page.words.length; i += 1) {
      if (seen.has(i)) {
        continue;
      }
      const w = page.words[i]!;
      const cx = (w.bbox[0] + w.bbox[2]) / 2;
      const cy = (w.bbox[1] + w.bbox[3]) / 2;
      if (
        cx >= cell.bbox[0] &&
        cx <= cell.bbox[2] &&
        cy >= cell.bbox[1] &&
        cy <= cell.bbox[3]
      ) {
        seen.set(i, "cell");
      }
    }
  }
  for (let i = 0; i < page.words.length; i += 1) {
    expect(seen.has(i), `word index ${i} (${page.words[i]?.text})`).toBe(true);
  }
  expect(seen.size).toBe(page.words.length);
}

function makeWord(text: string, x: number, y: number, seq: number): PageWord {
  return {
    seq,
    text,
    bbox: [x, y, x + text.length * 6, y + 12],
    confidence: null,
    fontName: null,
    fontSize: 12,
    bold: null,
    italic: null,
    source: "native",
  };
}

describe("assembleDocument", () => {
  it("L001 08_initial_iep page 2 services table row and prose sentence", () => {
    const snap = loadSnapshot("08_initial_iep.json");
    const assembled = assembleDocument(snap.documentPages);
    const tableBlocks = assembled.blocks.filter(
      (b) => b.pageNumber === 2 && b.kind === "table",
    );
    expect(tableBlocks.length).toBeGreaterThanOrEqual(1);
    const rowCells = assembled.cells.filter((c) => c.row === 1);
    expect(rowCells.length).toBe(5);
    const joined = rowCells
      .sort((a, b) => a.col - b.col)
      .map((c) => c.text)
      .join(" | ");
    expect(joined).toBe(
      "Specialized reading instruction | Weekly | 150 minutes | special education setting | 2024-11-12",
    );
    const prose = assembled.blocks.find(
      (b) =>
        b.pageNumber === 2 &&
        b.kind === "line" &&
        b.text.includes(
          "Specialized reading instruction is provided 150 minutes weekly in the special education setting.",
        ),
    );
    expect(prose).toBeDefined();
    const tableRow = assembled.blocks.find(
      (b) => b.pageNumber === 2 && b.parentBlockId === tableBlocks[0]!.id,
    );
    expect(tableRow?.id).not.toBe(prose?.id);
  });

  it("L001 Goal ID field value GOAL_READING_FLUENCY", () => {
    const snap = loadSnapshot("08_initial_iep.json");
    const assembled = assembleDocument(snap.documentPages);
    const goalFields = assembled.blocks.flatMap((b) => b.field ?? []).filter((f) => f.label === "Goal ID");
    expect(goalFields.some((f) => f.value === "GOAL_READING_FLUENCY")).toBe(true);
  });

  it("L001 footers are furniture", () => {
    const snap = loadSnapshot("08_initial_iep.json");
    const assembled = assembleDocument(snap.documentPages);
    const footers = assembled.blocks.filter((b) => b.kind === "furniture");
    const footerText = footers.map((b) => b.text).join(" ");
    expect(/SYNTHETIC DEVELOPMENT RECORD.*NestIEP Corpus.*L001\s*\|\s*Page/i.test(footerText)).toBe(
      true,
    );
  });

  it("L001 section 5 Annual Goal children span pages 1-2 under same heading", () => {
    const snap = loadSnapshot("08_initial_iep.json");
    const assembled = assembleDocument(snap.documentPages);
    const annualHeading = assembled.blocks.find(
      (b) => b.kind === "heading" && /5\.\s*Annual Goal/i.test(b.text),
    );
    expect(annualHeading).toBeDefined();
    const children = assembled.blocks.filter((b) => b.parentBlockId === annualHeading!.id);
    expect(children.some((b) => b.pageNumber === 1)).toBe(true);
    expect(children.some((b) => b.pageNumber === 2)).toBe(true);
  });

  it("lossless word indices for every L001 snapshot page", () => {
    const names = [
      "01_initial_referral.json",
      "02_evaluation_plan.json",
      "03_parent_evaluation_consent.json",
      "04_psychoeducational_evaluation.json",
      "05_academic_evaluation.json",
      "06_speech_language_evaluation.json",
      "07_eligibility_determination.json",
      "08_initial_iep.json",
    ];
    for (const name of names) {
      const snap = loadSnapshot(name);
      const assembled = assembleDocument(snap.documentPages);
      for (const page of snap.documentPages.pages) {
        assertLosslessWordIndices(assembled, page);
      }
    }
  });

  it("synthetic two-column page splits wide gap into separate blocks", () => {
    const pages: DocumentPages = {
      documentId: "two-col",
      sha256: "test",
      pages: [
        {
          documentId: "two-col",
          pageNumber: 1,
          width: 612,
          height: 792,
          rotation: 0,
          route: "native",
          imageRef: null,
          words: [
            makeWord("Left", 50, 100, 0),
            makeWord("column", 110, 100, 1),
            makeWord("Right", 400, 200, 2),
            makeWord("text", 460, 200, 3),
          ],
          quality: {
            textCoverage: null,
            meanConfidence: null,
            garbageRatio: 0,
            illegibleRegions: [],
          },
        },
      ],
      formFields: [],
    };
    const assembled = assembleDocument(pages);
    expect(assembled.blocks.length).toBeGreaterThanOrEqual(2);
    const texts = assembled.blocks.map((b) => b.text);
    expect(texts.some((t) => /Left/i.test(t))).toBe(true);
    expect(texts.some((t) => /Right/i.test(t))).toBe(true);
  });

  it("L001 eligibility [X] options and evaluation plan areas", () => {
    const snap = loadSnapshot("07_eligibility_determination.json");
    const assembled = assembleDocument(snap.documentPages);
    const eligible = assembled.blocks.find(
      (b) => b.kind === "option" && b.option?.label === "Eligible for special education",
    );
    expect(eligible?.option?.checked).toBe(true);
    const evalOptions = assembled.blocks.filter(
      (b) =>
        b.kind === "option" &&
        b.option?.checked === true &&
        /Evaluation - 2024/.test(b.option.label),
    );
    expect(evalOptions.length).toBeGreaterThanOrEqual(3);
  });

  it("L001 academic evaluation Measure | Result table has 3 rows", () => {
    const snap = loadSnapshot("05_academic_evaluation.json");
    const assembled = assembleDocument(snap.documentPages);
    const table = assembled.blocks.find((b) => b.kind === "table" && /Measure/i.test(b.text));
    expect(table).toBeDefined();
    const rows = assembled.blocks.filter((b) => b.parentBlockId === table!.id);
    expect(rows).toHaveLength(3);
    const joined = rows.map((r) => r.text).join("\n");
    expect(joined).toContain("Oral Reading Fluency | 42 WCPM");
    expect(joined).toContain("Oral Reading Accuracy | 86%");
    expect(joined).toContain("Reading Comprehension | Below expected classroom level");
  });

  it("synthetic repeated-form instances", () => {
    const words: PageWord[] = [];
    let seq = 0;
    const addLine = (text: string, y: number) => {
      for (const part of text.split(" ")) {
        words.push(makeWord(part, 50 + seq * 40, y, seq));
        seq += 1;
      }
    };
    for (let i = 0; i < 3; i += 1) {
      addLine("3. Student Profile", 100 + i * 200);
      addLine(`Instance ${i + 1}`, 120 + i * 200);
      addLine("Detail line", 140 + i * 200);
    }
    addLine("Other Section", 800);
    const pages: DocumentPages = {
      documentId: "repeat-form",
      sha256: "test",
      pages: [
        {
          documentId: "repeat-form",
          pageNumber: 1,
          width: 612,
          height: 900,
          rotation: 0,
          route: "native",
          imageRef: null,
          words,
          quality: {
            textCoverage: null,
            meanConfidence: null,
            garbageRatio: 0,
            illegibleRegions: [],
          },
        },
      ],
      formFields: [],
    };
    const assembled = assembleDocument(pages);
    expect(assembled.instances.length).toBeGreaterThanOrEqual(1);
  });
});
