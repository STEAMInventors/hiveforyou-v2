import "server-only";

import { openAiCallModelFromEnv } from "@/lib/model/openai-call-model.server";
import { buildProExportTables } from "@hiveforyou/core/pro-export-tables";
import { buildExportSystemPrompt } from "@hiveforyou/core/pro-export-prompt";
import { validateSql } from "@hiveforyou/core/pro-validate-sql";
import { getDomainPackByDomainId } from "@hiveforyou/domain-packs";

import { CaseNotFoundError } from "@/lib/canonical-study/study-service-server";
import { loadCaseMapViewBundle, StudyRunNotFoundError } from "@/lib/case-map/case-map-bundle-service-server";
import { readServerEnv } from "@/lib/env/server-env";

import { buildProViewModelForBundle } from "./build-pro-view-for-bundle";
import { quotesByFactIdFromCaseView } from "./pro-quotes-from-case-view";
import { buildStudyFromBundle } from "./pro-study-from-bundle";
import { executeProSql } from "./pro-sql-execute.server";

export type ProQueryGenerateResult = {
  sql: string | null;
  explanation: string;
  columns: string[];
  assumptions: string[];
  unanswerable: string | null;
};

type ModelPayload = ProQueryGenerateResult;

async function callExportModel(request: string, retryErrors?: string): Promise<ModelPayload> {
  const env = readServerEnv();
  if (!env.OPENAI_API_KEY) {
    throw new Error("ENGINE_UNAVAILABLE");
  }
  const system = buildExportSystemPrompt();
  const user = retryErrors
    ? `${request}\n\nYour previous answer failed these checks: ${retryErrors}. Fix them and return JSON only.`
    : request;
  const model = env.HIVE_OPENAI_MODEL ?? env.HIVE_STORY_WRITER_MODEL ?? "gpt-4o-mini";
  const callModel = openAiCallModelFromEnv(env);
  if (!callModel) {
    throw new Error("ENGINE_UNAVAILABLE");
  }
  const response = await callModel({
    model,
    temperature: 0,
    reasoningEffort: "low",
    systemPrompt: system,
    userContent: user,
    textFormat: { type: "json_object" },
  });
  const text = response.outputText;
  if (!text) {
    throw new Error("MALFORMED_PROPOSAL");
  }
  return JSON.parse(text) as ModelPayload;
}

function exportTablesForBundle(
  bundle: Awaited<ReturnType<typeof loadCaseMapViewBundle>>,
  summary: { documentCount: number; domainLabel: string },
) {
  if (!bundle.caseView || !bundle.canonicalSnapshot) {
    throw new Error("CASE_NOT_READY");
  }
  const quotesByFactId = quotesByFactIdFromCaseView(bundle.caseView);
  const viewModel = buildProViewModelForBundle({ bundle, summary, quotesByFactId });
  const pack = getDomainPackByDomainId(bundle.canonicalSnapshot.domainId);
  const study = buildStudyFromBundle(bundle);
  if (!pack || !viewModel || !study) {
    throw new Error("CASE_NOT_READY");
  }
  const documentFactStats = bundle.caseView.documents.reduce<
    Record<string, { count: number; pages: number[] }>
  >((acc, doc) => {
    acc[doc.sourceDocumentId] = { count: 0, pages: [] };
    return acc;
  }, {});
  return buildProExportTables({
    pack,
    study,
    viewModel,
    documents: bundle.caseView.documents.map((d) => ({
      sourceDocumentId: d.sourceDocumentId,
      logicalDocumentId: d.logicalDocumentId,
      fileName: d.fileName,
      documentType: d.documentType,
      documentDate: d.documentDate,
    })),
    quotesByFactId,
    documentFactStats,
  });
}

async function loadAuthorizedBundle(caseId: string, studyRunId: string) {
  const bundle = await loadCaseMapViewBundle(studyRunId);
  if (bundle.caseId !== caseId) {
    throw new CaseNotFoundError();
  }
  return bundle;
}

export async function generateProQuerySql(input: {
  caseId: string;
  studyRunId: string;
  request: string;
}): Promise<ProQueryGenerateResult> {
  const bundle = await loadAuthorizedBundle(input.caseId, input.studyRunId);
  const summary = {
    documentCount: bundle.caseView?.documents.length ?? 0,
    domainLabel: bundle.canonicalSnapshot?.domainId ?? "Case",
  };
  const tables = exportTablesForBundle(bundle, summary);

  let payload = await callExportModel(input.request);
  if (payload.unanswerable || !payload.sql) {
    return payload;
  }
  let validation = validateSql(payload.sql);
  if (validation) {
    payload = await callExportModel(input.request, validation);
  }
  if (payload.unanswerable || !payload.sql) {
    return payload;
  }
  validation = validateSql(payload.sql);
  if (validation) {
    return {
      sql: null,
      explanation: validation,
      columns: [],
      assumptions: [],
      unanswerable: validation,
    };
  }
  try {
    const { columns } = executeProSql(tables, payload.sql);
    if (payload.columns.length && payload.columns.some((c) => !columns.includes(c))) {
      return callExportModel(
        input.request,
        `columns mismatch: expected ${payload.columns.join(", ")}, got ${columns.join(", ")}`,
      );
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Query failed";
    return {
      sql: payload.sql,
      explanation: message,
      columns: payload.columns,
      assumptions: payload.assumptions,
      unanswerable: message,
    };
  }
  return payload;
}

export async function runProQuerySql(input: { caseId: string; studyRunId: string; sql: string }) {
  const bundle = await loadAuthorizedBundle(input.caseId, input.studyRunId);
  const summary = {
    documentCount: bundle.caseView?.documents.length ?? 0,
    domainLabel: bundle.canonicalSnapshot?.domainId ?? "Case",
  };
  const tables = exportTablesForBundle(bundle, summary);
  return executeProSql(tables, input.sql);
}

export { CaseNotFoundError, StudyRunNotFoundError };
