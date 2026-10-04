import {

  domainPackRecordId,

  evaluatePackCompleteness,

  INTAKE_PACK_EXECUTION_SCHEMA_VERSION,

  type IntakeDomainPackExecutor,

  type IntakePackCollectionInput,

  type IntakePackExecutionResult,

  type IntakePackLogicalDocument,

  type IntakePackProcessingDisposition,

} from "@hiveforyou/domain-pack";



import { iepScanDocumentFromNormalized } from "./adapters/from-normalized-extraction";

import { authoritativeDocumentDate } from "./document-interpreter/authoritative-date";
import { classifyIepDocumentLocally } from "./document-interpreter/classify-local";
import { resolveIepTemporalRoles } from "./document-interpreter/temporal-resolution";

import { iepProcessingDisposition } from "./document-interpreter/disposition";

import { segmentIepScanDocuments } from "./document-interpreter/logical-segmentation";

import { iepCatalogDocumentType } from "./evidence-requirements/catalog-document-type";

import { customerLabelForClassification } from "./presentation/customer-labels";

import { iepManifest } from "./manifest";



function mapFamilyForOutput(family: string): string {

  if (family === "OTHER") {

    return "OTHER_EDUCATIONAL";

  }

  return family;

}



function withSegmentationReview(

  disposition: IntakePackProcessingDisposition,

  segmentationUnresolved: boolean,

): IntakePackProcessingDisposition {

  if (!segmentationUnresolved) {

    return disposition;

  }

  if (disposition === "DO_NOT_PROCESS") {

    return disposition;

  }

  return "NEEDS_REVIEW";

}



export async function executeIepIntakePack(

  input: IntakePackCollectionInput,

): Promise<IntakePackExecutionResult> {

  const pending: Array<{
    sourceFilename: string;
    sourceDocumentId: string;
    pageStart: number;
    pageEnd: number;
    pageText: string;
    classification: ReturnType<typeof classifyIepDocumentLocally>;
    processingDisposition: IntakePackProcessingDisposition;
  }> = [];

  const unresolvedUploads = new Set<string>();



  for (const source of input.documents) {

    const scanDoc = iepScanDocumentFromNormalized({

      sourceDocumentId: source.sourceDocumentId,

      filename: source.filename,

      mimeType: source.normalized.mimeType,

      normalized: source.normalized,

    });

    const segmented = await segmentIepScanDocuments([scanDoc], input.packetSegmentationResolver);

    for (const uploadId of segmented.diagnostics.unresolvedPacketUploadIds) {

      unresolvedUploads.add(uploadId);

    }



    for (const slice of segmented.documents) {

      const pageStart = slice.logicalStartPage ?? slice.pages[0]?.pageNumber ?? 1;

      const pageEnd = slice.logicalEndPage ?? slice.pages.at(-1)?.pageNumber ?? pageStart;

      const sourceDocumentId = slice.sourceUploadId ?? source.sourceDocumentId;

      const segmentationUnresolved = unresolvedUploads.has(sourceDocumentId);



      const classification = classifyIepDocumentLocally(slice);

      const processingDisposition = withSegmentationReview(

        iepProcessingDisposition({

          classification,

          genericIdentity: source.genericIdentity,

        }),

        segmentationUnresolved,

      );



      pending.push({
        sourceFilename: source.filename,
        sourceDocumentId,
        pageStart,
        pageEnd,
        pageText: slice.pages.map((page) => page.text).join("\n"),
        classification,
        processingDisposition,
      });

    }

  }



  const dated = pending.map((doc) => {
    const documentDate =
      doc.classification.temporalRole === "draft"
        ? null
        : authoritativeDocumentDate(
            doc.classification.family,
            doc.classification.subtype,
            doc.pageText,
          );
    return { ...doc, documentDate };
  });

  const roles = resolveIepTemporalRoles(
    dated.map((doc) => ({
      id: `${doc.sourceDocumentId}:${doc.pageStart}-${doc.pageEnd}`,
      family: doc.classification.family,
      subtype: doc.classification.subtype,
      documentDate: doc.documentDate,
      temporalRole: doc.classification.temporalRole,
      documentStatus: doc.classification.documentStatus,
    })),
  );
  const roleById = new Map(roles.map((doc) => [doc.id, doc]));

  const logicalDocuments: IntakePackLogicalDocument[] = dated.map((doc) => {
    const id = `${doc.sourceDocumentId}:${doc.pageStart}-${doc.pageEnd}`;
    const resolved = roleById.get(id);
    return {
      logicalDocumentId: id,
      sourceDocumentId: doc.sourceDocumentId,
      pageStart: doc.pageStart,
      pageEnd: doc.pageEnd,
      documentFamily: mapFamilyForOutput(doc.classification.family),
      documentSubtype: doc.classification.subtype,
      processingDisposition: doc.processingDisposition,
      classificationConfidence: doc.classification.confidence,
      classificationReason: doc.classification.classificationReason,
      customerLabel: customerLabelForClassification(doc.classification),
      documentDate: resolved?.documentDate ?? doc.documentDate,
      temporalRole: resolved?.temporalRole ?? doc.classification.temporalRole,
      sourceFilename: doc.sourceFilename,
    };
  });

  const presentDocumentTypes = new Set(

    logicalDocuments

      .filter((doc) => doc.processingDisposition === "PROCESS")

      .map((doc) => iepCatalogDocumentType(doc)),

  );

  const expectations = evaluatePackCompleteness({

    missingExpectations: input.missingExpectations,

    presentDocumentTypes,

    dispositions: input.dispositions?.map((row) => ({

      packExpectationId: row.packExpectationId,

      disposition:

        row.disposition === "DISCARDED"

          ? "I_DONT_HAVE_IT"

          : row.disposition,

    })),

  });



  const collectionNeedsReview =

    logicalDocuments.some((doc) => doc.processingDisposition === "NEEDS_REVIEW") ||

    logicalDocuments.every((doc) => doc.processingDisposition === "DO_NOT_PROCESS") ||

    unresolvedUploads.size > 0;



  return {

    schemaVersion: INTAKE_PACK_EXECUTION_SCHEMA_VERSION,

    domainPackId: domainPackRecordId(iepManifest.id),

    domainPackVersion: iepManifest.version,

    logicalDocuments,

    completeness: {

      expectations,

      collectionNeedsReview,

    },

  };

}



export const iepIntakeExecutor: IntakeDomainPackExecutor = {

  domainId: iepManifest.id,

  execute: executeIepIntakePack,

};

