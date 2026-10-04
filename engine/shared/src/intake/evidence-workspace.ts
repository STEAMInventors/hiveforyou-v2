import type { IntakeCustomerView, IntakeCustomerViewDocumentInput } from "./customer-view";

import { computeIntakeWorkspaceReady, toIntakeCustomerView } from "./customer-view";

import type { IntakeDocumentStatus, IntakeRunStatus } from "./document-identity";

import { documentIdentityLabel, intakeDocumentProgressCopy } from "./document-identity";

import { physicalFileTypeLabel } from "./file-type-label";



export type IntakeStudyPath = "DOMAIN_PACK" | "GENERIC_STUDY";



export type IntakeSourceAnalysisDisposition = "PRESENT" | "DISCARDED";



export type IntakePurposeView = {

  rawIntent: string | null;

  explicitDomainId: string | null;

  resolvedDomainId: string | null;

  resolutionSource: string | null;

  displayPurpose: string;

  domainName: string | null;

};



export type IntakeLogicalDocumentView = {

  logicalDocumentId: string;

  customerLabel: string;

  pageStart: number;

  pageEnd: number;

  processingDisposition: string;

};



export type IntakeSourceFileView = {

  sourceDocumentId: string;

  filename: string;

  fileTypeLabel: string;

  sizeBytes: number;

  disposition: IntakeSourceAnalysisDisposition;

  documentTypeSummary: string;

  logicalDocuments: IntakeLogicalDocumentView[];

  processingStatus: IntakeDocumentStatus;

};



export type IntakeUnderstoodEvidenceRow = {

  logicalDocumentId: string;

  customerLabel: string;

  sourceDocumentId: string;

  pageStart: number;

  pageEnd: number;

  processingDisposition: string;

};



export type IntakeThingsThatWouldHelpRow = {

  packExpectationId: string;

  customerLabel: string;

  requirementClass: string;

  state: string;

};



export type IntakePackExecutionSnapshot = {

  logicalDocuments: Array<{

    logicalDocumentId: string;

    sourceDocumentId: string;

    pageStart: number;

    pageEnd: number;

    processingDisposition: string;

    customerLabel: string;

  }>;

  completeness: {

    expectations: Array<{

      packExpectationId: string;

      requirementClass: string;

      expectedDocumentType: string;

      state: string;

    }>;

    collectionNeedsReview: boolean;

  };

};



export type IntakeEvidenceWorkspaceView = IntakeCustomerView & {

  caseId: string;

  studyPath: IntakeStudyPath;

  purpose: IntakePurposeView;

  sourceFiles: IntakeSourceFileView[];

  /** @deprecated Prefer sourceFiles for workspace UI. */

  understoodEvidence: IntakeUnderstoodEvidenceRow[];

  thingsThatWouldHelp: IntakeThingsThatWouldHelpRow[];

};



export type IntakeEvidenceWorkspaceDocumentInput = IntakeCustomerViewDocumentInput & {

  mimeType: string | null;

  analysisDisposition: IntakeSourceAnalysisDisposition;

};



function documentTypeSummaryForSource(input: {

  logicalDocuments: IntakeLogicalDocumentView[];

  processingStatus: IntakeDocumentStatus;

  genericLabel: string | null;

}): string {

  const active = input.logicalDocuments.filter(

    (doc) => doc.processingDisposition !== "DO_NOT_PROCESS",

  );

  if (active.length === 1) {

    return active[0]?.customerLabel ?? input.genericLabel ?? intakeDocumentProgressCopy(input.processingStatus);

  }

  if (active.length > 1) {

    return `${active.length} documents`;

  }

  if (input.genericLabel) {

    return input.genericLabel;

  }

  return intakeDocumentProgressCopy(input.processingStatus);

}



export function buildIntakeSourceFiles(input: {

  documents: IntakeEvidenceWorkspaceDocumentInput[];

  packExecution: IntakePackExecutionSnapshot | null;

}): IntakeSourceFileView[] {

  const logicalBySource = new Map<string, IntakeLogicalDocumentView[]>();

  for (const doc of input.packExecution?.logicalDocuments ?? []) {

    const list = logicalBySource.get(doc.sourceDocumentId) ?? [];

    list.push({

      logicalDocumentId: doc.logicalDocumentId,

      customerLabel: doc.customerLabel,

      pageStart: doc.pageStart,

      pageEnd: doc.pageEnd,

      processingDisposition: doc.processingDisposition,

    });

    logicalBySource.set(doc.sourceDocumentId, list);

  }



  return input.documents.map((document) => {

      const logicalDocuments = logicalBySource.get(document.sourceDocumentId) ?? [];

      const genericLabel =

        document.processingStatus === "CLASSIFIED" && document.proposedType

          ? documentIdentityLabel(document.proposedType)

          : null;

      return {

        sourceDocumentId: document.sourceDocumentId,

        filename: document.filename,

        fileTypeLabel: physicalFileTypeLabel(document.mimeType, document.filename),

        sizeBytes: document.sizeBytes,

        disposition: document.analysisDisposition,

        logicalDocuments,

        processingStatus: document.processingStatus,

        documentTypeSummary: documentTypeSummaryForSource({

          logicalDocuments,

          processingStatus: document.processingStatus,

          genericLabel,

        }),

      };

    });

}



export function toIntakeEvidenceWorkspaceView(input: {

  run: { id: string; status: IntakeRunStatus; caseId: string; startedAt?: string | null };

  documents: IntakeEvidenceWorkspaceDocumentInput[];

  purpose: IntakePurposeView;

  studyPath: IntakeStudyPath;

  packExecution: IntakePackExecutionSnapshot | null;

}): IntakeEvidenceWorkspaceView {

  const base = toIntakeCustomerView(input.run, input.documents);

  const sourceFiles = buildIntakeSourceFiles({

    documents: input.documents,

    packExecution: input.packExecution,

  });

  const understoodEvidence =

    input.packExecution?.logicalDocuments

      .filter((doc) => doc.processingDisposition !== "DO_NOT_PROCESS")

      .map((doc) => ({

        logicalDocumentId: doc.logicalDocumentId,

        customerLabel: doc.customerLabel,

        sourceDocumentId: doc.sourceDocumentId,

        pageStart: doc.pageStart,

        pageEnd: doc.pageEnd,

        processingDisposition: doc.processingDisposition,

      })) ?? [];



  const thingsThatWouldHelp =

    input.packExecution?.completeness.expectations

      .filter((row) => row.state === "OPEN")

      .map((row) => ({

        packExpectationId: row.packExpectationId,

        customerLabel: row.expectedDocumentType,

        requirementClass: row.requirementClass,

        state: row.state,

      })) ?? [];



  return {

    ...base,

    caseId: input.run.caseId,

    studyPath: input.studyPath,

    purpose: input.purpose,

    sourceFiles,

    understoodEvidence,

    thingsThatWouldHelp,

  };

}



export { computeIntakeWorkspaceReady };

