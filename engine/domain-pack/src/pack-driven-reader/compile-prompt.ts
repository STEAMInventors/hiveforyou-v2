import {
  PACK_DRIVEN_READER_PROMPT_VERSION,
  UNIVERSAL_PACK_DRIVEN_READER_INSTRUCTIONS,
} from "./constants.js";
import { computeProposalPackContentSha256 } from "./pack-hash.js";
import {
  buildPackDrivenReaderOutputJsonSchema,
  buildStablePackDrivenReaderOutputJsonSchema,
} from "./output-schema.js";
import {
  resolveDocumentTypeSpec,
  selectRecordDefinitions,
} from "./select-checklist.js";
import type {
  CompilePackDrivenReaderPromptInput,
  CompilePackDrivenReaderPromptResult,
} from "./types.js";
import { validateProposalDomainPack } from "./validate-proposal-pack.js";

const EXCLUDED_PROMPT_KEYS = new Set([
  "requirements",
  "insightChecks",
  "plainExplainers",
  "audiences",
]);

function buildVocabularySection(pack: CompilePackDrivenReaderPromptInput["pack"]): string {
  const vocab = pack.vocabulary;
  if (!vocab) return "";
  const parts: string[] = [];
  if (vocab.note) parts.push(vocab.note);
  if (vocab.abbreviations && Object.keys(vocab.abbreviations).length) {
    parts.push(
      "### Abbreviations\n" +
        Object.entries(vocab.abbreviations)
          .map(([k, v]) => `- ${k}: ${v}`)
          .join("\n"),
    );
  }
  if (vocab.unitAliases) {
    const unitLines: string[] = [];
    if (Array.isArray(vocab.unitAliases)) {
      for (const row of vocab.unitAliases) {
        unitLines.push(`- ${row.canonical}: ${row.aliases.join(", ")}`);
      }
    } else if (Object.keys(vocab.unitAliases).length) {
      for (const [k, aliases] of Object.entries(vocab.unitAliases)) {
        const list = Array.isArray(aliases) ? aliases : [String(aliases)];
        unitLines.push(`- ${k}: ${list.join(", ")}`);
      }
    }
    if (unitLines.length) {
      parts.push("### Unit aliases\n" + unitLines.join("\n"));
    }
  }
  if (vocab.fieldSynonyms?.length) {
    parts.push(
      "### Field synonyms\n" +
        vocab.fieldSynonyms
          .map((s) => {
            const terms = (s as { synonyms?: string[]; terms?: string[] }).synonyms ??
              (s as { terms?: string[] }).terms ??
              [];
            return `- ${s.field}: ${terms.join(", ")}`;
          })
          .join("\n"),
    );
  }
  if (vocab.easilyConfused?.length) {
    parts.push(
      "### Easily confused terms\n" +
        vocab.easilyConfused.map((e) => `- ${e.term}: ${e.meaning}`).join("\n"),
    );
  }
  return parts.join("\n\n");
}

function buildPackDefinitionBlock(
  pack: CompilePackDrivenReaderPromptInput["pack"],
  packHash: string,
  outputSchema: Record<string, unknown>,
): string {
  const packSnapshot = {
    schemaVersion: pack.schemaVersion,
    status: pack.status,
    manifest: pack.manifest,
    fieldSources: pack.fieldSources,
    modalities: pack.modalities,
    missingStates: pack.missingStates,
    evidencePolicy: pack.evidencePolicy,
    constructs: pack.constructs,
    unclassifiedPolicy: pack.unclassifiedPolicy,
  };

  return [
    "## Domain pack definition (declarative snapshot)",
    `packId: ${pack.manifest.id}`,
    `packVersion: ${pack.manifest.version}`,
    `packContentSha256: ${packHash}`,
    `promptCompilerVersion: ${PACK_DRIVEN_READER_PROMPT_VERSION}`,
    "",
    "Pack snapshot (requirements, insight checks, plain explainers, vocabulary JSON, and legal conclusions are intentionally omitted from extraction):",
    JSON.stringify(packSnapshot, null, 2),
    "",
    "## Output contract (JSON Schema — respond inside extraction_json as this object)",
    JSON.stringify(outputSchema, null, 2),
    "",
    buildVocabularySection(pack),
  ]
    .filter(Boolean)
    .join("\n");
}

function buildManifestBlock(manifest: CompilePackDrivenReaderPromptInput["caseManifest"]): string {
  return [
    "## Case document manifest (context only — not readable evidence)",
    JSON.stringify(
      manifest.map((entry) => ({
        sourceDocumentId: entry.sourceDocumentId,
        filename: entry.filename ?? null,
        pageCount: entry.pageCount ?? null,
        logicalDocumentId: entry.logicalDocumentId ?? null,
        documentTypeId: entry.documentTypeId ?? null,
      })),
      null,
      2,
    ),
  ].join("\n");
}

function buildDocumentTypeBlock(input: {
  documentTypeId: string;
  resolution: string;
  checklistPolicy: string;
  selectedRecords: ReturnType<typeof selectRecordDefinitions>;
  sourceDocumentId: string;
  readingNotesGlobal: string;
  readingNotesForType: string | null;
  unclassifiedPolicy?: string;
}): string {
  const fieldCount = input.selectedRecords.reduce((n, r) => n + r.fields.length, 0);
  return [
    "## Document classification and checklist",
    `documentTypeId: ${input.documentTypeId}`,
    `resolution: ${input.resolution}`,
    `checklistPolicy: ${input.checklistPolicy}`,
    input.unclassifiedPolicy ? `unclassifiedPolicy: ${input.unclassifiedPolicy}` : "",
    `checklistRecordTypes (${input.selectedRecords.length} records, ${fieldCount} fields): ${input.selectedRecords.map((r) => r.recordTypeId).join(", ")}`,
    "",
    "### Global reading notes",
    input.readingNotesGlobal,
    input.readingNotesForType
      ? `\n### Document-type reading notes\n${input.readingNotesForType}`
      : "",
    "",
    "### Document-scoped extraction targets",
    `sourceDocumentId: ${input.sourceDocumentId}`,
    "Use the stable output JSON Schema envelope from the system prefix; set documentTypeId and sourceDocumentId to the values above.",
    "Emit recordInstances only for record types listed below; fieldIds must come from this catalog.",
    "",
    "### Record and field catalog for this document",
    JSON.stringify(
      input.selectedRecords.map((record) => ({
        recordTypeId: record.recordTypeId,
        label: record.label ?? null,
        repeatable: record.repeatable,
        identity: record.identity ?? null,
        usesConstructs: record.usesConstructs ?? [],
        fields: record.fields.map((f) => ({
          id: f.id,
          valueKind: f.valueKind,
          source: f.source,
          modality: f.modality ?? [],
          enum: f.enum ?? null,
          unit: f.unit ?? null,
          description: f.description ?? null,
          modelMayEmit: !f.source.includes("derived"),
          derivation: f.source.includes("derived") ? f.derivation ?? null : null,
        })),
      })),
      null,
      2,
    ),
  ]
    .filter(Boolean)
    .join("\n");
}

function buildPagesBlock(document: CompilePackDrivenReaderPromptInput["document"]): string {
  const sorted = [...document.pages].sort((a, b) => a.pageNumber - b.pageNumber);
  return [
    "## Current document pages (sole evidence corpus)",
    `sourceDocumentId: ${document.sourceDocumentId}`,
    JSON.stringify(
      {
        sourceDocumentId: document.sourceDocumentId,
        pages: sorted.map((p) => ({
          pageNumber: p.pageNumber,
          text: p.text,
        })),
      },
      null,
      2,
    ),
  ].join("\n");
}

function assertNoExcludedKeysInPromptText(text: string): void {
  for (const key of EXCLUDED_PROMPT_KEYS) {
    if (text.includes(`"${key}"`) && text.includes("insightChecks")) {
      throw new Error("Prompt leak: insightChecks material detected");
    }
  }
  const goldenLeakPatterns = [/l001ConceptsMapped/i, /golden_reference/i, /CITED_PENDING_LEGAL_REVIEW/];
  for (const pattern of goldenLeakPatterns) {
    if (pattern.test(text)) {
      throw new Error(`Prompt leak detected: ${pattern}`);
    }
  }
}

export function compilePackDrivenReaderPrompt(
  input: CompilePackDrivenReaderPromptInput,
): CompilePackDrivenReaderPromptResult {
  const validation = validateProposalDomainPack(input.pack);
  if (!validation.valid) {
    throw new Error(`Invalid proposal domain pack: ${validation.errors.join("; ")}`);
  }

  const allowFallback = input.allowGenericUnclassifiedFallback ?? true;
  const typeSpec = resolveDocumentTypeSpec({
    pack: input.pack,
    documentTypeId: input.documentTypeId,
    allowGenericUnclassifiedFallback: allowFallback,
  });

  const selectedRecords = selectRecordDefinitions(input.pack, typeSpec.checklistRecordTypeIds);
  const packHash = computeProposalPackContentSha256(input.pack);

  const stableOutputJsonSchema = buildStablePackDrivenReaderOutputJsonSchema({
    packId: input.pack.manifest.id,
    packVersion: input.pack.manifest.version,
  });

  const outputJsonSchema = buildPackDrivenReaderOutputJsonSchema({
    packId: input.pack.manifest.id,
    packVersion: input.pack.manifest.version,
    documentTypeId: typeSpec.documentTypeId,
    sourceDocumentId: input.document.sourceDocumentId,
    selectedRecords,
  });

  const blockA = UNIVERSAL_PACK_DRIVEN_READER_INSTRUCTIONS;
  const blockB = buildPackDefinitionBlock(input.pack, packHash, stableOutputJsonSchema);
  const blockC = buildManifestBlock(input.caseManifest);
  const blockD = buildDocumentTypeBlock({
    documentTypeId: typeSpec.documentTypeId,
    resolution: typeSpec.resolution,
    checklistPolicy: typeSpec.checklistPolicy,
    selectedRecords,
    sourceDocumentId: input.document.sourceDocumentId,
    readingNotesGlobal: input.pack.readingNotes.global,
    readingNotesForType:
      typeSpec.documentType?.id != null
        ? input.pack.readingNotes.byDocumentType[typeSpec.documentType.id] ?? null
        : null,
    unclassifiedPolicy: input.pack.unclassifiedPolicy,
  });
  const blockE = buildPagesBlock(input.document);

  const stableSystemPrefix = `${blockA}\n\n${blockB}`;
  const caseUserContent = `${blockC}\n\n${blockD}\n\n${blockE}`;

  assertNoExcludedKeysInPromptText(stableSystemPrefix);
  assertNoExcludedKeysInPromptText(caseUserContent);

  const selectedFieldCount = selectedRecords.reduce((n, r) => n + r.fields.length, 0);

  const result: CompilePackDrivenReaderPromptResult = {
    promptVersion: PACK_DRIVEN_READER_PROMPT_VERSION,
    packId: input.pack.manifest.id,
    packVersion: input.pack.manifest.version,
    packContentSha256: packHash,
    documentTypeId: typeSpec.documentTypeId,
    documentTypeResolved: typeSpec.resolution,
    selectedRecordTypeIds: typeSpec.checklistRecordTypeIds,
    selectedFieldCount,
    stableSystemPrefix,
    caseUserContent,
    outputJsonSchema,
    blocks: {
      A_universal: blockA,
      B_packDefinitionAndContract: blockB,
      C_caseManifest: blockC,
      D_documentTypeChecklist: blockD,
      E_documentPages: blockE,
    },
  };

  if (input.emitCacheBoundaryHints) {
    result.cacheBoundaryHints = {
      stablePrefixEndsAfterBlock: "B",
      variableUserBlocks: ["C", "D", "E"],
    };
  }

  return result;
}
