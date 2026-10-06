// @vitest-environment node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PDFDocument, StandardFonts, degrees } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { extractNativeWords } from "./extract-native-words";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

async function buildRotationFixturePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const page0 = doc.addPage([612, 792]);
  page0.drawText("ROT0_MARKER", { x: 72, y: 700, size: 12, font });

  const page90 = doc.addPage([612, 792]);
  page90.setRotation(degrees(90));
  page90.drawText("ROT90_MARKER", { x: 72, y: 700, size: 12, font });

  return new Uint8Array(await doc.save());
}

describe("extractNativeWords rotation", () => {
  it("places known markers on 0° and 90° pages inside page bounds", async () => {
    const fixturePath = join(packageRoot, "fixtures/extraction/files/rotation-0-90.pdf");
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(readFileSync(fixturePath));
    } catch {
      bytes = await buildRotationFixturePdf();
    }

    const documentPages = await extractNativeWords(bytes, {
      documentId: "rotation-fixture",
      sha256: "rotation-fixture",
    });
    expect(documentPages.pages).toHaveLength(2);

    const page0 = documentPages.pages[0]!;
    expect(page0.rotation).toBe(0);
    const rot0 = page0.words.find((word) => word.text === "ROT0_MARKER");
    expect(rot0).toBeDefined();
    expect(rot0!.bbox[0]).toBeGreaterThanOrEqual(0);
    expect(rot0!.bbox[2]).toBeLessThanOrEqual(page0.width + 2);

    const page90 = documentPages.pages[1]!;
    expect(page90.rotation).toBe(90);
    const rot90 = page90.words.find((word) => word.text === "ROT90_MARKER");
    expect(rot90).toBeDefined();
    expect(rot90!.bbox[0]).toBeGreaterThanOrEqual(0);
    expect(rot90!.bbox[2]).toBeLessThanOrEqual(page90.width + 8);
  });
});
