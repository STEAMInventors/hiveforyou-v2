import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getDomainPackByDomainId, listDomainPackManifests } from "@hiveforyou/domain-pack";
import "@hiveforyou/domain-packs";

import {
  checkPackAuditReadiness,
  listPackSlots,
} from "../engine/domain-packs/_shared/rulebook/pack-context.ts";
import type { HandlingKind } from "../engine/domain-packs/_shared/rulebook/schema.ts";
import {
  decideFromModel,
  type AuditPlan,
  type DocSignals,
  type ModelDecision,
  signalOnlyDecisions,
  summarizeDecisions,
} from "./rulebook-audit.decide.ts";
import { createRulebookModelClient } from "./rulebook-model-client.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const packsRoot = join(repoRoot, "engine/domain-packs");

function buildSignals(
  docType: string,
  slots: ReturnType<typeof listPackSlots>,
  anchorDocType: string | undefined,
  existingGuides: Map<string, HandlingKind>,
): DocSignals {
  const sourced = slots.filter((s) => s.sourceDocTypes.includes(docType));
  const slotCount = sourced.length;
  const deadline = sourced.some((s) =>
    /deadline|due|respond|appeal|hearing|effective/i.test(`${s.id} ${s.label}`),
  );
  return {
    docType,
    slotCount,
    isAnchor: docType === anchorDocType,
    hasDates: sourced.some((s) => /date/i.test(s.id)),
    hasDeadlineSlots: deadline,
    hasCodedValues: false,
    alreadyHasGuide: existingGuides.has(docType),
  };
}

function parseModelOutput(parsed: unknown, domain: string): ModelDecision[] {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("model output is not an object");
  }
  const record = parsed as { domain?: string; decisions?: unknown };
  if (record.domain !== domain) {
    throw new Error("model domain mismatch");
  }
  if (!Array.isArray(record.decisions)) {
    throw new Error("model decisions missing");
  }
  return record.decisions as ModelDecision[];
}

async function auditDomain(domainId: string): Promise<AuditPlan> {
  const pack = getDomainPackByDomainId(domainId);
  if (!pack) {
    throw new Error(`unknown domain ${domainId}`);
  }
  const readiness = checkPackAuditReadiness(pack);
  const generatedAt = new Date().toISOString();
  const modelName = process.env.RULEBOOK_MODEL_NAME ?? "local";
  const errors: string[] = [];

  if (!readiness.ok) {
    errors.push(
      `STOP: pack '${readiness.domainId}' missing ${readiness.missing.join(", ")}`,
    );
    return {
      domain: domainId,
      generatedAt,
      model: modelName,
      status: "model-failed",
      summary: { "document-guide": 0, "notice-guide": 0, "glossary-only": 0, none: 0 },
      decisions: [],
      errors,
    };
  }

  const slots = readiness.slots;
  const slotIds = new Set(slots.map((s) => s.id));
  const existingGuides = new Map<string, HandlingKind>();
  for (const guide of pack.rulebook?.guides ?? []) {
    existingGuides.set(guide.docType, guide.kind);
    if (
      pack.manifest.id === "iep" &&
      guide.docType === "Individualized Education Program" &&
      pack.story.anchorDocType === "IEP"
    ) {
      existingGuides.set("IEP", guide.kind);
    }
  }

  const signalsByDoc = new Map<string, DocSignals>();
  for (const docType of readiness.documentTypes) {
    signalsByDoc.set(
      docType,
      buildSignals(docType, slots, pack.story.anchorDocType, existingGuides),
    );
  }

  const userPayload = {
    domain: domainId,
    displayName: pack.manifest.name,
    documentTypes: readiness.documentTypes.map((docType) => ({
      docType,
      signals: signalsByDoc.get(docType),
    })),
    slots,
  };

  let status: AuditPlan["status"] = "ok";
  let modelDecisions: ModelDecision[] = [];
  let rawModel = "";

  const client = createRulebookModelClient();
  try {
    let attempt = await client.completeJson(userPayload);
    rawModel = attempt.raw;
    try {
      modelDecisions = parseModelOutput(attempt.parsed, domainId);
    } catch (parseError) {
      const message = parseError instanceof Error ? parseError.message : String(parseError);
      attempt = await client.completeJson({
        ...userPayload,
        parseError: message,
        priorOutput: attempt.raw,
      });
      rawModel = attempt.raw;
      modelDecisions = parseModelOutput(attempt.parsed, domainId);
    }
  } catch (error) {
    status = "model-failed";
    errors.push(error instanceof Error ? error.message : String(error));
    const decisions = signalOnlyDecisions(
      readiness.documentTypes,
      signalsByDoc,
      existingGuides,
    );
    const plan: AuditPlan = {
      domain: domainId,
      generatedAt,
      model: modelName,
      status,
      summary: summarizeDecisions(decisions),
      decisions,
      errors,
    };
    writePlanFiles(domainId, plan, rawModel);
    return plan;
  }

  const { decisions, errors: decideErrors } = decideFromModel({
    domain: domainId,
    documentTypes: readiness.documentTypes,
    slotIds,
    signalsByDoc,
    existingGuideKinds: existingGuides,
    modelDecisions,
  });
  errors.push(...decideErrors);

  const plan: AuditPlan = {
    domain: domainId,
    generatedAt,
    model: modelName,
    status,
    summary: summarizeDecisions(decisions),
    decisions,
    errors,
  };
  writePlanFiles(domainId, plan, rawModel);
  return plan;
}

function writePlanFiles(domainId: string, plan: AuditPlan, rawModel: string): void {
  const rulebookDir = join(packsRoot, domainId, "rulebook");
  mkdirSync(rulebookDir, { recursive: true });
  writeFileSync(join(rulebookDir, "rulebook.plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  if (rawModel) {
    const auditDir = join(rulebookDir, ".audit");
    mkdirSync(auditDir, { recursive: true });
    const stamp = plan.generatedAt.replace(/[:.]/g, "-");
    writeFileSync(join(auditDir, `raw-${stamp}.json`), rawModel);
  }
}

async function main(): Promise<void> {
  const domains = listDomainPackManifests().map((m) => m.id);
  for (const domainId of domains) {
    const plan = await auditDomain(domainId);
    console.log(JSON.stringify(plan, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
