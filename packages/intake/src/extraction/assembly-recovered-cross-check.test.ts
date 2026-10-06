// @vitest-environment node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { assembleDocument } from "@hiveforyou/core/document/assembly";
import { describe, expect, it } from "vitest";

import { pageWordsToRawTextItems } from "./page-model-bbox";
import { buildRecoveredPage } from "./nestiep/buildRecoveredPage";

const snapshotDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/l001/document-pages",
);

describe("assembleDocument vs buildRecoveredPage segments", () => {
  it("matches segment boundaries on L001 08_initial_iep non-table lines", () => {
    const snap = JSON.parse(readFileSync(join(snapshotDir, "08_initial_iep.json"), "utf8"));
    const pages = snap.documentPages;
    const assembled = assembleDocument(pages);

    for (const page of pages.pages) {
      const items = pageWordsToRawTextItems(page.words, page.height);
      const recovered = buildRecoveredPage({
        runId: "cross-check",
        sourceDocumentId: pages.documentId,
        pageNumber: page.pageNumber,
        extractionMethod: "NATIVE",
        items,
      });

      const tableBlockIds = new Set(
        assembled.blocks.filter((b) => b.pageNumber === page.pageNumber && b.kind === "table").map((b) => b.id),
      );
      const tableRowBlockIds = new Set(
        assembled.blocks
          .filter(
            (b) =>
              b.pageNumber === page.pageNumber &&
              b.parentBlockId != null &&
              tableBlockIds.has(b.parentBlockId),
          )
          .map((b) => b.id),
      );

      const assemblyLines = assembled.blocks.filter(
        (b) =>
          b.pageNumber === page.pageNumber &&
          b.kind === "line" &&
          !tableRowBlockIds.has(b.id) &&
          b.segments.length > 0,
      );

      for (const block of assemblyLines) {
        const recoveredLine = recovered.lines.find((line) => {
          const asmText = block.segments.map((s) => s.text).join(" ");
          return line.text === asmText || line.text === block.text.replaceAll(" | ", " ");
        });
        if (!recoveredLine || !recoveredLine.segments?.length) {
          continue;
        }
        expect(block.segments.length).toBe(recoveredLine.segments.length);
        for (let i = 0; i < block.segments.length; i += 1) {
          expect(block.segments[i]!.text).toBe(recoveredLine.segments[i]!.text);
        }
      }
    }
  });
});
