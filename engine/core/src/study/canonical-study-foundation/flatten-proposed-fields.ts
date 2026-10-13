import type { ProposalDomainPack } from "@hiveforyou/domain-pack";
import { parseAndValidatePackDrivenExtraction } from "@hiveforyou/domain-pack/pack-driven-reader";
import type { ReaderDocumentExtractionEnvelope } from "@hiveforyou/shared/reader-document-extraction";
import type {
  CanonicalStudyFoundationEnvelopeRef,
  CanonicalStudyFoundationEvidence,
  CanonicalStudyFoundationProposedField,
  CanonicalStudyFoundationUnresolvedItem,
} from "@hiveforyou/shared/canonical-study-foundation";

import { buildFieldKey } from "./field-key.js";

export type FlattenProposedFieldsResult = {
  proposedFields: CanonicalStudyFoundationProposedField[];
  unresolvedItems: CanonicalStudyFoundationUnresolvedItem[];
};

function envelopeRef(envelope: ReaderDocumentExtractionEnvelope): CanonicalStudyFoundationEnvelopeRef {
  return {
    studyRunId: envelope.studyRunId,
    attemptId: envelope.attemptId,
    sourceDocumentId: envelope.sourceDocumentId,
    envelopeStatus: envelope.status,
  };
}

function toEvidence(
  raw: { sourceDocumentId: string; page: number; quote: string } | null,
): CanonicalStudyFoundationEvidence | null {
  if (!raw) {
    return null;
  }
  return {
    sourceDocumentId: raw.sourceDocumentId,
    page: raw.page,
    quote: raw.quote,
  };
}

export function flattenProposedFields(input: {
  pack: ProposalDomainPack;
  envelopes: ReaderDocumentExtractionEnvelope[];
}): FlattenProposedFieldsResult {
  const proposedFields: CanonicalStudyFoundationProposedField[] = [];
  const unresolvedItems: CanonicalStudyFoundationUnresolvedItem[] = [];

  for (const envelope of input.envelopes) {
    const ref = envelopeRef(envelope);

    if (envelope.status !== "SUCCEEDED") {
      unresolvedItems.push({
        id: `extraction-unavailable:${envelope.sourceDocumentId}`,
        kind: "extraction_unavailable",
        message: `Raw extraction envelope status ${envelope.status} for document ${envelope.sourceDocumentId}.`,
        sourceDocumentId: envelope.sourceDocumentId,
      });
      continue;
    }

    if (!envelope.parsedModelJson) {
      unresolvedItems.push({
        id: `parse-failure:${envelope.sourceDocumentId}`,
        kind: "parse_failure",
        message: `Succeeded envelope missing parsedModelJson for document ${envelope.sourceDocumentId}.`,
        sourceDocumentId: envelope.sourceDocumentId,
      });
      continue;
    }

    const parsed = parseAndValidatePackDrivenExtraction({
      pack: input.pack,
      raw: envelope.parsedModelJson,
      expectedSourceDocumentId: envelope.sourceDocumentId,
    });

    if (parsed.errors.length > 0 && parsed.recordInstances.length === 0) {
      unresolvedItems.push({
        id: `parse-failure:${envelope.sourceDocumentId}`,
        kind: "parse_failure",
        message: `Structural parse failed for document ${envelope.sourceDocumentId}: ${parsed.errors.join("; ")}`,
        sourceDocumentId: envelope.sourceDocumentId,
      });
      continue;
    }

    for (const record of parsed.recordInstances) {
      for (const field of record.fields) {
        proposedFields.push({
          fieldKey: buildFieldKey({
            sourceDocumentId: envelope.sourceDocumentId,
            recordTypeId: record.recordTypeId,
            instanceIndex: record.instanceIndex,
            fieldId: field.fieldId,
          }),
          sourceDocumentId: envelope.sourceDocumentId,
          recordTypeId: record.recordTypeId,
          instanceIndex: record.instanceIndex,
          fieldId: field.fieldId,
          documentTypeId: parsed.documentTypeId,
          valueKind: field.valueKind,
          provenance: field.provenance,
          modality: field.modality,
          missingState: field.missingState,
          displayValue: field.value,
          evidence: toEvidence(field.evidence),
          envelopeRef: ref,
          parseErrors: parsed.errors,
        });
      }
    }
  }

  proposedFields.sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));
  unresolvedItems.sort((a, b) => a.id.localeCompare(b.id));

  return { proposedFields, unresolvedItems };
}
