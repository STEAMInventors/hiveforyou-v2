/**
 * Rebuild synthetic extraction fixture binaries (no real student data).
 * Usage: node fixtures/extraction/generate-fixtures.mjs
 */
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, PDFHexString, StandardFonts, rgb } from "pdf-lib";
import PDFDocumentKit from "pdfkit";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT_DIR = join(__dirname, "files");

/** Pinned so two generator runs write identical bytes. */
const FIXTURE_INSTANT_MS = Date.UTC(2026, 0, 15, 12, 0, 0);
const FIXTURE_PDF_ID = "00112233445566778899aabbccddeeff";

function pinClock() {
  const OriginalDate = Date;
  class PinnedDate extends OriginalDate {
    constructor(...args) {
      if (args.length === 0) {
        super(FIXTURE_INSTANT_MS);
      } else {
        super(...args);
      }
    }

    static now() {
      return FIXTURE_INSTANT_MS;
    }
  }
  PinnedDate.parse = OriginalDate.parse;
  PinnedDate.UTC = OriginalDate.UTC;
  globalThis.Date = PinnedDate;
  return () => {
    globalThis.Date = OriginalDate;
  };
}

function pinPdfLibDocument(pdfDoc) {
  const id = PDFHexString.of(FIXTURE_PDF_ID);
  pdfDoc.context.trailerInfo.ID = pdfDoc.context.obj([id, id]);
  pdfDoc.setCreator("hive-extraction-fixtures");
  pdfDoc.setAuthor("hive-extraction-fixtures");
  pdfDoc.setCreationDate(new Date(FIXTURE_INSTANT_MS));
}

function pdfKitOptions(title) {
  return {
    info: {
      Title: title,
      Author: "hive-extraction-fixtures",
      Creator: "hive-extraction-fixtures",
      Producer: "hive-extraction-fixtures",
      CreationDate: new Date(FIXTURE_INSTANT_MS),
    },
  };
}

/** Enough identity text for MIN_IDENTITY_TEXT_CHARS (80 non-whitespace). */
const IDENTITY_PARAGRAPH =
  "Synthetic fixture document for automated extraction regression testing only. " +
  "No real student names, identifiers, or protected health information are present. " +
  "Repeat marker: ALPHA-BRAVO-CHARLIE-DELTA-ECHO-FOXTROT.";

/** 1×1 PNG (valid, tiny). */
const MINIMAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let OUT_DIR = DEFAULT_OUT_DIR;

function ensureOutDir() {
  mkdirSync(OUT_DIR, { recursive: true });
}

async function writePdf(name, build) {
  const doc = await PDFDocument.create();
  pinPdfLibDocument(doc);
  await build(doc);
  const bytes = await doc.save();
  writeFileSync(join(OUT_DIR, name), bytes);
}

async function embedScanImage(page, pdfDoc) {
  const image = await pdfDoc.embedPng(MINIMAL_PNG);
  const { width, height } = page.getSize();
  page.drawImage(image, { x: 0, y: 0, width, height });
}

/** Case 1: image-only page (no native text operators). */
async function case01ScannedImageOnly() {
  await writePdf("01-scanned-image-only.pdf", async (pdfDoc) => {
    const page = pdfDoc.addPage([612, 792]);
    await embedScanImage(page, pdfDoc);
  });
}

/** Case 2: short native signature (<40 alphanumeric characters). */
async function case02ShortSignature() {
  await writePdf("02-short-signature.pdf", async (pdfDoc) => {
    const page = pdfDoc.addPage([612, 792]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    page.drawText("Signed: J. Doe", { x: 72, y: 700, size: 12, font, color: rgb(0, 0, 0) });
  });
}

/** Case 3: kerning-style split text items ("Ma"+"ya", "8"+"5"). */
async function case03KerningSplits() {
  await writePdf("03-kerning-splits.pdf", async (pdfDoc) => {
    const page = pdfDoc.addPage([612, 792]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    page.drawText("Ma", { x: 72, y: 700, size: 14, font });
    page.drawText("ya", { x: 92, y: 700, size: 14, font });
    page.drawText("8", { x: 72, y: 680, size: 14, font });
    page.drawText("5", { x: 82, y: 680, size: 14, font });
    page.drawText(IDENTITY_PARAGRAPH, { x: 72, y: 640, size: 10, font, maxWidth: 468 });
  });
}

/** Case 4: two-column narrative (current behavior: reading-order interleave until C4). */
async function case04TwoColumnNarrative() {
  await writePdf("04-two-column-narrative.pdf", async (pdfDoc) => {
    const page = pdfDoc.addPage([612, 792]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const leftLines = [
      "Left column line one for fixture.",
      "Left column line two for fixture.",
      "Left column line three for fixture.",
    ];
    const rightLines = [
      "Right column line one for fixture.",
      "Right column line two for fixture.",
      "Right column line three for fixture.",
    ];
    let y = 720;
    for (let i = 0; i < leftLines.length; i += 1) {
      page.drawText(leftLines[i], { x: 72, y, size: 11, font });
      page.drawText(rightLines[i], { x: 320, y, size: 11, font });
      y -= 24;
    }
    page.drawText(IDENTITY_PARAGRAPH, { x: 72, y: y - 40, size: 9, font, maxWidth: 468 });
  });
}

/** Case 5: password-protected PDF (pdfkit; pdf.js raises PasswordException). */
async function case05Encrypted() {
  await new Promise((resolve, reject) => {
    const outPath = join(OUT_DIR, "05-encrypted.pdf");
    const doc = new PDFDocumentKit({
      ...pdfKitOptions("05-encrypted"),
      userPassword: "fixture",
      ownerPassword: "owner-fixture",
    });
    const stream = createWriteStream(outPath);
    doc.pipe(stream);
    doc.fontSize(12).text("Encrypted fixture content must not be extracted without password.");
    doc.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
    doc.on("error", reject);
  });
}

/** Point page 2 at a missing Contents object so pdf.js fails that page only. */
function breakSecondPageContentsRef(pdfBytes) {
  const buf = Buffer.from(pdfBytes);
  const contentsMark = Buffer.from("/Contents ");
  let pos = 0;
  let hit = 0;
  while (pos < buf.length) {
    const idx = buf.indexOf(contentsMark, pos);
    if (idx === -1) {
      break;
    }
    hit += 1;
    if (hit === 2) {
      const numStart = idx + contentsMark.length;
      const numEnd = buf.indexOf(" 0 R", numStart);
      if (numEnd === -1) {
        throw new Error("Could not parse page 2 Contents reference.");
      }
      return Buffer.concat([
        buf.subarray(0, numStart),
        Buffer.from("99999"),
        buf.subarray(numEnd),
      ]);
    }
    pos = idx + contentsMark.length;
  }
  throw new Error("Could not locate page 2 /Contents for corruption patch.");
}

/** Case 6: three pages; middle page content stream corrupted after save. */
async function case06CorruptedMiddlePage() {
  const chunks = [];
  await new Promise((resolve, reject) => {
    const doc = new PDFDocumentKit({
      ...pdfKitOptions("06-corrupted-middle-page"),
      autoFirstPage: false,
    });
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", resolve);
    doc.on("error", reject);
    for (let i = 0; i < 3; i += 1) {
      doc.addPage({ size: [612, 792] });
      doc.fontSize(10).text(`Good page ${i + 1}. ${IDENTITY_PARAGRAPH}`, { width: 468 });
    }
    doc.end();
  });
  const bytes = breakSecondPageContentsRef(Buffer.concat(chunks));
  writeFileSync(join(OUT_DIR, "06-corrupted-middle-page.pdf"), bytes);
}

/** Case 7: UTF-8 plain text with charset parameter. */
function case07PlainUtf8() {
  const text =
    "UTF-8 fixture line.\n" +
    IDENTITY_PARAGRAPH +
    "\nCurly quotes: “synthetic” — em dash.\n";
  writeFileSync(join(OUT_DIR, "07-plain-utf8.txt"), text, "utf8");
}

/** Case 8: UTF-16 LE with BOM. */
function case08PlainUtf16Bom() {
  const text = `UTF-16 fixture line.\n${IDENTITY_PARAGRAPH}\n`;
  const bom = Buffer.from([0xff, 0xfe]);
  const body = Buffer.from(text, "utf16le");
  writeFileSync(join(OUT_DIR, "08-plain-utf16-bom.txt"), Buffer.concat([bom, body]));
}

/** Minimal OOXML .docx (unsupported for text recovery). */
function case09Docx() {
  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    "<w:body><w:p><w:r><w:t>Synthetic docx fixture paragraph.</w:t></w:r></w:p></w:body></w:document>";
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    "</Types>";
  const rels =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    "</Relationships>";
  const entries = [
    { name: "[Content_Types].xml", data: contentTypes },
    { name: "_rels/.rels", data: rels },
    { name: "word/document.xml", data: documentXml },
  ];
  writeFileSync(join(OUT_DIR, "09-sample.docx"), buildZip(entries));
}

function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const dataBuf = Buffer.from(entry.data, "utf8");
    const crc = crc32(dataBuf);
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(dataBuf.length, 18);
    local.writeUInt32LE(dataBuf.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);
    localParts.push(local, dataBuf);
    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(dataBuf.length, 20);
    central.writeUInt32LE(dataBuf.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);
    centralParts.push(central);
    offset += local.length + dataBuf.length;
  }
  const centralDir = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDir, end]);
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Case 12: word gap before digits; pdf.js may bake kerning "8 5" into one item (left as "8 5"). */
async function case12ScoreKerningBakedItem() {
  await writePdf("12-score-kerning-baked-item.pdf", async (pdfDoc) => {
    const page = pdfDoc.addPage([612, 792]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    page.drawText("Score", { x: 72, y: 700, size: 14, font });
    page.drawText("8", { x: 130, y: 700, size: 14, font });
    page.drawText("5", { x: 140, y: 700, size: 14, font });
    page.drawText(IDENTITY_PARAGRAPH, { x: 72, y: 660, size: 10, font, maxWidth: 468 });
  });
}

/** Case 13: one pdf.js item with real spaces between grade digits. */
async function case13GradesSpacedDigits() {
  await writePdf("13-grades-spaced-digits.pdf", async (pdfDoc) => {
    const page = pdfDoc.addPage([612, 792]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    page.drawText("Grades 3 4 5", { x: 72, y: 700, size: 14, font });
    page.drawText(IDENTITY_PARAGRAPH, { x: 72, y: 660, size: 10, font, maxWidth: 468 });
  });
}

/** Case 14: one item, spaced date tokens. */
async function case14DateSpaced() {
  await writePdf("14-date-spaced.pdf", async (pdfDoc) => {
    const page = pdfDoc.addPage([612, 792]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    page.drawText("11 12 2024", { x: 72, y: 700, size: 14, font });
    page.drawText(IDENTITY_PARAGRAPH, { x: 72, y: 660, size: 10, font, maxWidth: 468 });
  });
}

/** Case 15: one item, spaced phone number. */
async function case15PhoneSpaced() {
  await writePdf("15-phone-spaced.pdf", async (pdfDoc) => {
    const page = pdfDoc.addPage([612, 792]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    page.drawText("706 555 1234", { x: 72, y: 700, size: 14, font });
    page.drawText(IDENTITY_PARAGRAPH, { x: 72, y: 660, size: 10, font, maxWidth: 468 });
  });
}

/** Case 11: a real word gap stays two tokens ("Score" + "85"). */
async function case11WordSpaceGap() {
  await writePdf("11-word-space-gap.pdf", async (pdfDoc) => {
    const page = pdfDoc.addPage([612, 792]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    page.drawText("Score", { x: 72, y: 700, size: 14, font });
    page.drawText("85", { x: 160, y: 700, size: 14, font });
    page.drawText(IDENTITY_PARAGRAPH, { x: 72, y: 660, size: 10, font, maxWidth: 468 });
  });
}

/** Case 10: page 1 native text + page 2 scanned image → PARTIAL when OCR unavailable. */
async function case10MixedNativeScanned() {
  await writePdf("10-mixed-native-scanned.pdf", async (pdfDoc) => {
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const textPage = pdfDoc.addPage([612, 792]);
    textPage.drawText(IDENTITY_PARAGRAPH, { x: 72, y: 700, size: 11, font, maxWidth: 468 });
    const scanPage = pdfDoc.addPage([612, 792]);
    await embedScanImage(scanPage, pdfDoc);
  });
}

export async function generateExtractionFixtures(outDir = DEFAULT_OUT_DIR) {
  const restoreClock = pinClock();
  const previous = OUT_DIR;
  OUT_DIR = outDir;
  try {
    ensureOutDir();
    await case01ScannedImageOnly();
    await case02ShortSignature();
    await case03KerningSplits();
    await case04TwoColumnNarrative();
    await case05Encrypted();
    await case06CorruptedMiddlePage();
    case07PlainUtf8();
    case08PlainUtf16Bom();
    case09Docx();
    await case10MixedNativeScanned();
    await case11WordSpaceGap();
    await case12ScoreKerningBakedItem();
    await case13GradesSpacedDigits();
    await case14DateSpaced();
    await case15PhoneSpaced();
  } finally {
    OUT_DIR = previous;
    restoreClock();
  }
}

const invokedDirectly = process.argv[1]?.replaceAll("\\", "/").endsWith("generate-fixtures.mjs");

if (invokedDirectly) {
  generateExtractionFixtures()
    .then(() => {
      // eslint-disable-next-line no-console -- operator script
      console.log(`Wrote extraction fixtures to ${DEFAULT_OUT_DIR}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
