import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  documentPagesSnapshotPath,
  ensureDocumentPagesSnapshot,
  type DocumentPagesSnapshot,
} from "./ensure-document-pages.ts";
import { repoRoot } from "./paths.ts";
import { stableJson } from "./prompt-hash.ts";

function comparableDocumentPagesSnapshot(snapshot: DocumentPagesSnapshot): DocumentPagesSnapshot {
  return {
    ...snapshot,
    documentPages: {
      ...snapshot.documentPages,
      pages: snapshot.documentPages.pages.map((page) => ({
        ...page,
        words: page.words.map(({ fontName: _fontName, ...word }) => word),
      })),
    },
  };
}

const l001Pdf = join(repoRoot(), "engine/intake/fixtures/l001/02_evaluation_plan.pdf");
const l001CommittedSnapshot = join(
  repoRoot(),
  "engine/intake/fixtures/l001/document-pages/02_evaluation_plan.json",
);

describe("ensureDocumentPagesSnapshot", () => {
  it("builds missing document-pages from PDF and matches committed L001 snapshot", async () => {
    const dir = mkdtempSync(join(tmpdir(), "shadow-pages-"));
    try {
      cpSync(l001Pdf, join(dir, "02_evaluation_plan.pdf"));
      const bytes = readFileSync(join(dir, "02_evaluation_plan.pdf"));
      const sha256 = createHash("sha256").update(bytes).digest("hex");

      const first = await ensureDocumentPagesSnapshot({
        corpusDir: dir,
        pdfFilename: "02_evaluation_plan.pdf",
        sha256,
      });
      expect(first.created).toBe(true);

      const snapshotPath = documentPagesSnapshotPath(dir, "02_evaluation_plan.pdf");
      const onDisk = readFileSync(snapshotPath, "utf8");

      const second = await ensureDocumentPagesSnapshot({
        corpusDir: dir,
        pdfFilename: "02_evaluation_plan.pdf",
        sha256,
      });
      expect(second.created).toBe(false);
      expect(readFileSync(snapshotPath, "utf8")).toBe(onDisk);

      const committed = JSON.parse(
        readFileSync(l001CommittedSnapshot, "utf8"),
      ) as DocumentPagesSnapshot;
      const built = JSON.parse(onDisk) as DocumentPagesSnapshot;
      expect(stableJson(comparableDocumentPagesSnapshot(built))).toBe(
        stableJson(comparableDocumentPagesSnapshot(committed)),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("replay reads the same snapshot bytes after build", async () => {
    const dir = mkdtempSync(join(tmpdir(), "shadow-pages-replay-"));
    try {
      cpSync(l001Pdf, join(dir, "02_evaluation_plan.pdf"));
      const bytes = readFileSync(join(dir, "02_evaluation_plan.pdf"));
      const sha256 = createHash("sha256").update(bytes).digest("hex");

      await ensureDocumentPagesSnapshot({
        corpusDir: dir,
        pdfFilename: "02_evaluation_plan.pdf",
        sha256,
      });
      const afterBuild = readFileSync(
        documentPagesSnapshotPath(dir, "02_evaluation_plan.pdf"),
        "utf8",
      );

      await ensureDocumentPagesSnapshot({
        corpusDir: dir,
        pdfFilename: "02_evaluation_plan.pdf",
        sha256,
      });
      const afterReplay = readFileSync(
        documentPagesSnapshotPath(dir, "02_evaluation_plan.pdf"),
        "utf8",
      );

      expect(afterReplay).toBe(afterBuild);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});