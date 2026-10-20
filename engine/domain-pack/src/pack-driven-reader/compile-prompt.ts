import {
  PACK_DRIVEN_READER_PROMPT_VERSION,
  UNIVERSAL_PACK_DRIVEN_READER_INSTRUCTIONS,
} from "./constants.js";
import { computeProposalPackContentSha256 } from "./pack-hash.js";
import { buildPackDrivenReaderOutputJsonSchema } from "./output-schema.js";
import type {
  CompilePackDrivenReaderPromptInput,
  CompilePackDrivenReaderPromptResult,
  ProposalDomainPack,
} from "./types.js";
import { validateProposalDomainPack } from "./validate-proposal-pack.js";

const EXCLUDED_PROMPT_KEYS = new Set([
  "requirements",
  "insightChecks",
  "plainExplainers",
  "audiences",
]);

function buildVocabularySection(pack: ProposalDomainPack): string {
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
          .map((s) => `- ${s.field}: ${s.terms.join(", ")}`)
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

function buildDocumentTypeCatalog(pack: ProposalDomainPack): string {
  const catalog = pack.documentTypes.map((dt) => ({
    id: dt.id,
    label: dt.label ?? null,
    discoverLabels: dt.discoverLabels ?? [],
    authorRole: dt.authorRole ?? null,
    checklist: dt.checklist,
    checklistPolicy: dt.checklistPolicy ?? null,
    classificationPolicy: dt.classificationPolicy ?? null,
    orderingDate: dt.orderingDate ?? null,
    readingNotes: pack.readingNotes.byDocumentType[dt.id] ?? null,
  }));
  return [
    "## Document-type catalog (classify using these ids)",
    JSON.stringify(catalog, null, 2),
  ].join("\n");
}

function buildRecordTypeCatalog(pack: ProposalDomainPack): string {
  const records = pack.recordTypes.map((record) => ({
    recordTypeId: record.id,
    label: record.label ?? null,
    repeatable: record.repeatable ?? false,
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
  }));
  return ["## Record-type and field catalog", JSON.stringify(records, null, 2)].join("\n");
}

function buildPackDefinitionBlock(pack: ProposalDomainPack, packHash: string): string {
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
    genericUnclassifiedChecklist: pack.genericUnclassifiedChecklist ?? null,
    genericUnclassifiedChecklistNote:
      pack.genericUnclassifiedChecklist?.length
        ? "Explicit generic checklist for unclassified reading."
        : "When null, validation uses the intersection of all document-type checklists for unclassified reading — never speculative generic extraction.",
  };

  return [
    "## Domain pack definition (declarative snapshot)",
    `packId: ${pack.manifest.id}`,
    `packVersion: ${pack.manifest.version}`,
    `packContentSha256: ${packHash}`,
    `promptCompilerVersion: ${PACK_DRIVEN_READER_PROMPT_VERSION}`,
    "",
    "Pack snapshot (requirements, insight checks, plain explainers, and legal conclusions are intentionally omitted from extraction):",
    JSON.stringify(packSnapshot, null, 2),
    "",
    buildDocumentTypeCatalog(pack),
    "",
    buildRecordTypeCatalog(pack),
    "",
    "### Global reading notes",
    pack.readingNotes.global,
    "",
    buildVocabularySection(pack),
  ]
    .filter(Boolean)
    .join("\n");
}

function buildOutputContractBlock(outputSchema: Record<string, unknown>): string {
  return [
    "## Output contract (JSON Schema — respond as this object for this document only)",
    JSON.stringify(outputSchema, null, 2),
  ].join("\n");
}

function buildManifestBlock(manifest: CompilePackDrivenReaderPromptInput["caseManifest"]): string {
  return [
    "## Case document manifest (context only — not readable evidence)",
    "Discover classification fields (discoverDocumentTypeLabel / discoverDocumentTypeId) are advisory hints only.",
    "You may choose a different valid pack documentTypeId when page evidence supports it.",
    JSON.stringify(
      manifest.map((entry) => ({
        sourceDocumentId: entry.sourceDocumentId,
        filename: entry.filename ?? null,
        pageCount: entry.pageCount ?? null,
        logicalDocumentId: entry.logicalDocumentId ?? null,
        discoverDocumentTypeLabel: entry.discoverDocumentTypeLabel ?? null,
        discoverDocumentTypeId: entry.discoverDocumentTypeId ?? null,
      })),
      null,
      2,
    ),
  ].join("\n");
}

function buildDocumentTaskBlock(sourceDocumentId: string): string {
  return [
    "## Extraction task (this document only)",
    `sourceDocumentId: ${sourceDocumentId}`,
    "Steps:",
    "1. Classify: set documentTypeId to one pack catalog id, or UNKNOWN / AMBIGUOUS.",
    "2. Checklist coverage: for each record type on that document type's checklist, emit one checklistCoverage declaration (extracted | not_found | not_applicable | unresolved).",
    "3. Extract: emit recordInstances only for rows you can support with quotes; never invent instances for not_found or not_applicable.",
    "4. Set sourceDocumentId in output to the value above.",
    "5. For UNKNOWN or AMBIGUOUS: recordInstances must be [] and checklistCoverage must be [].",
  ].join("\n");
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

  const packHash = computeProposalPackContentSha256(input.pack);

  const outputJsonSchema = buildPackDrivenReaderOutputJsonSchema({
    pack: input.pack,
    sourceDocumentId: input.document.sourceDocumentId,
  });

  const blockA = UNIVERSAL_PACK_DRIVEN_READER_INSTRUCTIONS;
  const blockB = buildPackDefinitionBlock(input.pack, packHash);
  const blockC = buildManifestBlock(input.caseManifest);
  const blockD = buildDocumentTaskBlock(input.document.sourceDocumentId);
  const blockE = buildPagesBlock(input.document);
  const blockF = buildOutputContractBlock(outputJsonSchema);

  const stableSystemPrefix = `${blockA}\n\n${blockB}`;
  const caseUserContent = `${blockC}\n\n${blockD}\n\n${blockE}\n\n${blockF}`;

  assertNoExcludedKeysInPromptText(stableSystemPrefix);
  assertNoExcludedKeysInPromptText(caseUserContent);

  const result: CompilePackDrivenReaderPromptResult = {
    promptVersion: PACK_DRIVEN_READER_PROMPT_VERSION,
    packId: input.pack.manifest.id,
    packVersion: input.pack.manifest.version,
    packContentSha256: packHash,
    packDocumentTypeCount: input.pack.documentTypes.length,
    packRecordTypeCount: input.pack.recordTypes.length,
    stableSystemPrefix,
    caseUserContent,
    outputJsonSchema,
    blocks: {
      A_universal: blockA,
      B_packDefinitionAndContract: blockB,
      C_caseManifest: blockC,
      D_documentTask: blockD,
      E_documentPages: blockE,
      F_outputContract: blockF,
    },
  };

  if (input.emitCacheBoundaryHints) {
    result.cacheBoundaryHints = {
      stablePrefixEndsAfterBlock: "B",
      variableUserBlocks: ["C", "D", "E", "F"],
    };
  }

  return result;
}
