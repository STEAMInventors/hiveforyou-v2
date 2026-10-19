import {
  resolveDocumentTypeSpec,
  resolveProposalDocumentTypeIdFromDiscoverLabel,
  selectRecordDefinitions,
} from "@hiveforyou/domain-pack/pack-driven-reader";
import { defaultDeclarativePackRepoRoot } from "@hiveforyou/domain-packs/declarative";
import { resolveMappingPackForDomain } from "@hiveforyou/domain-packs/mapping-pack";
import { READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION } from "@hiveforyou/shared/reader-document-extraction";
import type { ReaderDocumentExtractionEnvelope } from "@hiveforyou/shared/reader-document-extraction";

import type { DocumentPages } from "../../document/page-model.js";
import { flattenProposedFields } from "../canonical-study-foundation/flatten-proposed-fields.js";
import { verifyProposedField } from "../canonical-study-foundation/verify-proposed-field.js";
import { buildReaderPackCompliance } from "./build-reader-pack-compliance.js";
import { composeReaderPromptFromMappingPack } from "./compose-reader-prompt-from-mapping-pack.js";
import {
  loadQualificationDocumentPages,
  qualificationLogicalDocumentsForCase,
  replayParsedModelJsonForDocument,
  replayRawAssistantText,
} from "./qualification-fixtures.js";
import { resolveDocumentProfileForDiscoverLabel } from "./resolve-document-profile-for-discover-label.js";
import type { ResolvedMappingPack } from "@hiveforyou/domain-packs/mapping-pack";
import type {
  ReaderCoverageGap,
  ReaderDocumentQualificationTrace,
  ReaderMappingPackContext,
  ReaderMappingPackValidationOutcome,
  ReaderPackComplianceFactRow,
  ReaderQualificationLogicalDocument,
} from "./types.js";

const QUALIFICATION_STUDY_RUN_ID = "reader-qualification-study";
const QUALIFICATION_ATTEMPT_ID = "reader-qualification-attempt";
const QUALIFICATION_CASE_ID = "reader-qualification-case";
const QUALIFICATION_USER_ID = "reader-qualification-user";

function buildCaseManifest(documents: ReaderQualificationLogicalDocument[]) {
  return documents.map((doc) => ({
    sourceDocumentId: doc.sourceDocumentId,
    filename: `${doc.logicalDocumentId}.pdf`,
    pageCount: doc.pageEnd - doc.pageStart + 1,
    logicalDocumentId: doc.logicalDocumentId,
    documentTypeId: doc.discoverDocumentTypeLabel,
  }));
}

function pagesForLogicalDocument(
  caseId: string,
  doc: ReaderQualificationLogicalDocument,
): DocumentPages {
  const pages = loadQualificationDocumentPages(caseId, doc.sourceDocumentId);
  if (!pages) {
    throw new Error(`Missing document pages for ${doc.sourceDocumentId}`);
  }
  const filtered = pages.pages.filter(
    (page) => page.pageNumber >= doc.pageStart && page.pageNumber <= doc.pageEnd,
  );
  return {
    ...pages,
    pages: filtered,
  };
}

function computeCoverageGaps(input: {
  context: ReaderMappingPackContext;
  documentTypeId: string;
  logicalDocument: ReaderQualificationLogicalDocument;
  extractedFieldIds: Set<string>;
}): ReaderCoverageGap[] {
  const typeSpec = resolveDocumentTypeSpec({
    pack: input.context.proposalPack,
    documentTypeId: input.documentTypeId,
    allowGenericUnclassifiedFallback: true,
  });
  const selected = selectRecordDefinitions(
    input.context.proposalPack,
    typeSpec.checklistRecordTypeIds,
  );
  const gaps: ReaderCoverageGap[] = [];
  for (const record of selected) {
    for (const field of record.fields) {
      const key = `${record.recordTypeId}:${field.id}`;
      if (!input.extractedFieldIds.has(key)) {
        gaps.push({
          logicalDocumentId: input.logicalDocument.logicalDocumentId,
          sourceDocumentId: input.logicalDocument.sourceDocumentId,
          documentTypeId: input.documentTypeId,
          recordTypeId: record.recordTypeId,
          fieldId: field.id,
          note: "Expected checklist field not extracted (coverage only; not an invented absence fact).",
        });
      }
    }
  }
  return gaps;
}

function envelopeForDocument(input: {
  context: ReaderMappingPackContext;
  caseId: string;
  doc: ReaderQualificationLogicalDocument;
  documentTypeId: string;
  parsedModelJson: Record<string, unknown>;
  promptVersion: string;
}): ReaderDocumentExtractionEnvelope {
  const rawAssistantText = replayRawAssistantText(input.parsedModelJson);
  return {
    schemaVersion: READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION,
    studyRunId: QUALIFICATION_STUDY_RUN_ID,
    attemptId: QUALIFICATION_ATTEMPT_ID,
    caseId: `${QUALIFICATION_CASE_ID}-${input.caseId}`,
    userId: QUALIFICATION_USER_ID,
    sourceDocumentId: input.doc.sourceDocumentId,
    domainId: input.context.pin.domainId ?? input.context.pin.packId,
    packId: input.context.pin.packId,
    packVersion: input.context.pin.packVersion,
    packContentSha256: input.context.pin.contentDigest,
    promptVersion: input.promptVersion,
    modelProvider: "fixture",
    modelId: "fixture-replay",
    status: "SUCCEEDED",
    occurredAt: "2026-10-18T00:00:00.000Z",
    rawAssistantText,
    parsedModelJson: input.parsedModelJson,
  };
}

export function validateReaderExtractionWithMappingPack(input: {
  caseId: string;
  context: ReaderMappingPackContext;
  resolvedPack: ResolvedMappingPack;
  logicalDocuments?: ReaderQualificationLogicalDocument[];
  replayVariant?: "valid" | "invalid_evidence";
}): ReaderMappingPackValidationOutcome {
  const logicalDocuments =
    input.logicalDocuments ?? qualificationLogicalDocumentsForCase(input.caseId);
  const manifest = buildCaseManifest(logicalDocuments);
  const issues: Array<{ code: string; message: string }> = [];
  const documentTraces: ReaderDocumentQualificationTrace[] = [];
  const factRows: ReaderPackComplianceFactRow[] = [];
  const coverageGaps: ReaderCoverageGap[] = [];
  const envelopes: ReaderDocumentExtractionEnvelope[] = [];
  const pagesBySource = new Map<string, DocumentPages>();

  for (const doc of logicalDocuments) {
    let documentTypeId: string;
    try {
      documentTypeId = resolveProposalDocumentTypeIdFromDiscoverLabel(
        input.context.proposalPack,
        doc.discoverDocumentTypeLabel,
      );
    } catch (error) {
      issues.push({
        code: "UNKNOWN_DISCOVER_LABEL",
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    const profile = resolveDocumentProfileForDiscoverLabel(input.resolvedPack, doc.discoverDocumentTypeLabel);
    const pages = pagesForLogicalDocument(input.caseId, doc);
    pagesBySource.set(doc.sourceDocumentId, pages);

    const prompt = composeReaderPromptFromMappingPack(input.context, {
      caseManifest: manifest,
      document: {
        sourceDocumentId: doc.sourceDocumentId,
        pages: pages.pages.map((page) => ({
          pageNumber: page.pageNumber,
          text: page.words
            .slice()
            .sort((a, b) => a.seq - b.seq)
            .map((word) => word.text)
            .join(" "),
        })),
      },
    });

    if (prompt.mappingPackPin.contentDigest !== input.context.pin.contentDigest) {
      issues.push({ code: "PACK_DIGEST_MISMATCH", message: "Prompt pin digest mismatch" });
    }

    const parsedModelJson = replayParsedModelJsonForDocument({
      caseId: input.caseId,
      sourceDocumentId: doc.sourceDocumentId,
      documentTypeId,
      variant: input.replayVariant ?? "valid",
    });

    const envelope = envelopeForDocument({
      context: input.context,
      caseId: input.caseId,
      doc,
      documentTypeId,
      parsedModelJson,
      promptVersion: prompt.promptVersion,
    });
    envelopes.push(envelope);

    documentTraces.push({
      logicalDocumentId: doc.logicalDocumentId,
      sourceDocumentId: doc.sourceDocumentId,
      discoverDocumentTypeLabel: doc.discoverDocumentTypeLabel,
      resolvedDocumentTypeId: documentTypeId,
      documentProfileId: profile?.profileId ?? null,
      conceptMappingsApplied: profile?.conceptIds ?? [],
      prompt: {
        promptVersion: prompt.promptVersion,
        packId: prompt.packId,
        packVersion: prompt.packVersion,
        packContentSha256: prompt.packContentSha256,
      },
      inputArtifactRef: `qualification://reader-input/${doc.logicalDocumentId}`,
      outputArtifactRef: `qualification://reader-output/${doc.sourceDocumentId}`,
      rawModelJsonPreserved: Boolean(envelope.rawAssistantText && envelope.parsedModelJson),
    });
  }

  const flattened = flattenProposedFields({
    pack: input.context.proposalPack,
    envelopes,
  });

  if (flattened.unresolvedItems.length > 0) {
    for (const item of flattened.unresolvedItems) {
      issues.push({ code: item.kind, message: item.message });
    }
  }

  const extractedKeysByDoc = new Map<string, Set<string>>();

  for (const field of flattened.proposedFields) {
    const pages = pagesBySource.get(field.sourceDocumentId) ?? null;
    const verification = verifyProposedField({
      field,
      pack: input.context.proposalPack,
      documentPages: pages,
    });

    const logicalDocumentId =
      logicalDocuments.find((doc) => doc.sourceDocumentId === field.sourceDocumentId)
        ?.logicalDocumentId ?? field.sourceDocumentId;

    const disposition =
      verification.status === "verified"
        ? "accepted"
        : verification.status === "rejected"
          ? "rejected"
          : "unresolved";

    factRows.push({
      fieldKey: field.fieldKey,
      sourceDocumentId: field.sourceDocumentId,
      logicalDocumentId,
      recordTypeId: field.recordTypeId,
      fieldId: field.fieldId,
      documentTypeId: field.documentTypeId,
      disposition,
      reasonCodes: verification.reasons,
      evidence: field.evidence ?? undefined,
      packPin: input.context.pin,
    });

    const keySet = extractedKeysByDoc.get(field.sourceDocumentId) ?? new Set<string>();
    keySet.add(`${field.recordTypeId}:${field.fieldId}`);
    extractedKeysByDoc.set(field.sourceDocumentId, keySet);
  }

  for (const doc of logicalDocuments) {
    const documentTypeId = resolveProposalDocumentTypeIdFromDiscoverLabel(
      input.context.proposalPack,
      doc.discoverDocumentTypeLabel,
    );
    coverageGaps.push(
      ...computeCoverageGaps({
        context: input.context,
        documentTypeId,
        logicalDocument: doc,
        extractedFieldIds: extractedKeysByDoc.get(doc.sourceDocumentId) ?? new Set(),
      }),
    );
  }

  const unexpectedSourceSupported = factRows.filter((row) => {
    if (row.disposition !== "accepted") {
      return false;
    }
    const trace = documentTraces.find((doc) => doc.sourceDocumentId === row.sourceDocumentId);
    const mappedConcepts = new Set(trace?.conceptMappingsApplied ?? []);
    return mappedConcepts.size > 0 && !mappedConcepts.has(row.fieldId);
  });

  const compliance = buildReaderPackCompliance({
    context: input.context,
    documents: documentTraces,
    facts: factRows,
    coverageGaps,
    unexpectedSourceSupported,
    issues,
  });

  return { compliance };
}

export function resolveResolvedPackForQualificationCase(
  caseId: string,
  context: ReaderMappingPackContext,
): ResolvedMappingPack {
  const normalized = caseId.trim().toLowerCase();
  const repoRoot = defaultDeclarativePackRepoRoot();
  if (normalized === "l001") {
    return resolveMappingPackForDomain({
      domainId: "iep",
      domainResolution: "known",
      repoRoot,
      allowPrerelease: true,
    });
  }
  if (normalized === "bankruptcy") {
    return resolveMappingPackForDomain({
      domainId: "bankruptcy",
      domainResolution: "unknown",
      repoRoot,
    });
  }
  return resolveMappingPackForDomain({
    domainId: context.pin.domainId ?? "generic",
    domainResolution: "unknown",
    repoRoot,
  });
}
