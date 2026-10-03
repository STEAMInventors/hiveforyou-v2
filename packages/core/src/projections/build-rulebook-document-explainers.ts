import "@hiveforyou/domain-packs";
import { getGuide } from "@hiveforyou/domain-pack";
import { getDomainPackByDomainId } from "@hiveforyou/domain-packs";
import type {
  DocumentGuide,
  GuideDate,
  GuideSection,
  Right,
  Rule,
  Term,
} from "@hiveforyou/domain-pack-shared/rulebook/schema";
import type { CaseDocument, CaseItem, CaseViewV2, Chip, DisplayValue } from "@hiveforyou/shared/projections";
import {
  constructRoot,
  IEP_MEASURE_LABELS,
  iepSectionForMeasure,
} from "@hiveforyou/shared/projections";

export type RulebookSectionStatus = "found" | "partial" | "notcaptured" | "later" | "notfound";

export type RulebookExplainerFact = {
  label: string;
  value: string;
  claimId?: string;
  sourceLabel?: string;
};

export type RulebookExplainerSayRow = {
  label: string;
  value: string;
  sourceLabel: string;
  claimId?: string;
};

export type RulebookExplainerSectionView = {
  id: string;
  parentTitle: string;
  docTitle: string;
  status: RulebookSectionStatus;
  statusLabel: string;
  summary: string;
  rules: Array<{ ref: string; title: string; plain: string; chipLabel: string }>;
  terms: Array<{ id: string; term: string; plain: string; abbr: string | null }>;
  facts: RulebookExplainerFact[];
  sayRows: RulebookExplainerSayRow[];
  emptyMessage: string | null;
  questions: string[];
};

export type RulebookExplainerDateView = {
  id: string;
  label: string;
  value: string | null;
  isEstimate: boolean;
  ruleRef: string | null;
  ruleChipLabel: string | null;
};

export type RulebookExplainerMeta = {
  domainPill: string;
  planPeriod: string | null;
  documentDate: string | null;
  primarySourceLabel: string;
};

export type RulebookDocumentExplainerView = {
  tabId: string;
  tabLabel: string;
  logicalDocumentId: string;
  docType: string;
  pageTitle: string;
  intro: string;
  meta: RulebookExplainerMeta;
  basics: Array<{ id: string; term: string; plain: string; abbr: string | null }>;
  dates: RulebookExplainerDateView[];
  sectionCounts: Record<RulebookSectionStatus, number>;
  sections: RulebookExplainerSectionView[];
  rights: Array<{
    title: string;
    plain: string;
    rules: Array<{ ref: string; title: string; plain: string; chipLabel: string }>;
  }>;
  disclaimer: string;
};

/** Guide section ids → anatomy measure sections used to attach validated facts. */
const GUIDE_SECTION_MEASURE_SECTIONS: Record<string, string[]> = {
  present: ["goals"],
  goals: ["goals"],
  progress: ["goals"],
  services: ["services"],
  supports: ["accommodations"],
  accommodations: ["accommodations"],
  participation: ["services"],
  lre: ["services"],
  factors: ["eligibility"],
  esy: ["services"],
  transition: ["services"],
};

const STATUS_LABELS: Record<RulebookSectionStatus, string> = {
  found: "Found",
  partial: "Partial",
  notcaptured: "Not captured",
  later: "Later",
  notfound: "Not in document",
};

export function formatRuleChip(ref: string): string {
  const section = ref.replace(/^idea:/i, "").trim();
  return section ? `§${section}` : ref;
}

export function resolveDomainPackId(input: {
  intelligenceDomainId?: string | null;
  domainLabel?: string | null;
}): string | null {
  const raw = input.intelligenceDomainId?.trim().toLowerCase() ?? "";
  if (raw.includes("iep") || raw.includes("special_education")) {
    return "iep";
  }
  if (raw.includes("medicaid")) {
    return "medicaid";
  }
  if (raw.includes("bankruptcy")) {
    return "bankruptcy";
  }
  const label = input.domainLabel?.toLowerCase() ?? "";
  if (label.includes("iep") || label.includes("special education")) {
    return "iep";
  }
  if (label.includes("medicaid")) {
    return "medicaid";
  }
  if (label.includes("bankruptcy")) {
    return "bankruptcy";
  }
  return null;
}

function docTypeCandidates(doc: CaseDocument): string[] {
  const out = new Set<string>();
  const t = doc.documentType?.trim();
  if (t) {
    out.add(t);
  }
  const hay = `${doc.documentType ?? ""} ${doc.fileName}`.toLowerCase();
  if (hay.includes("iep") && !hay.includes("progress") && !hay.includes("report")) {
    out.add("Individualized Education Program");
    out.add("IEP");
  }
  if (hay.includes("progress") || (hay.includes("report") && !hay.includes("eval"))) {
    out.add("Progress report");
  }
  if (hay.includes("notice of action") || hay.includes("noa")) {
    out.add("Notice of Action");
  }
  return [...out];
}

function shortDocName(doc: CaseDocument): string {
  return doc.fileName.replace(/\.pdf$/i, "").replace(/^\d+\s+/, "").trim();
}

function chipSourceLabel(chip: Chip, documents: CaseDocument[]): string {
  const doc = documents.find((d) => d.logicalDocumentId === chip.logicalDocumentId);
  const name = doc ? shortDocName(doc) : chip.fileName.replace(/\.pdf$/i, "").trim() || "Document";
  return `${name} · p.${chip.page}`;
}

function chipsForItem(item: CaseItem): Chip[] {
  if (item.state === "changed") {
    return item.series.flatMap((p) => p.chips);
  }
  if (item.state === "conflicting") {
    return item.sides.flatMap((s) => s.chips);
  }
  if ("chips" in item && Array.isArray(item.chips)) {
    return item.chips;
  }
  return [];
}

function primaryChipForItem(item: CaseItem): Chip | null {
  const chips = chipsForItem(item);
  return chips[0] ?? null;
}

function claimIdForItem(item: CaseItem): string | undefined {
  if (item.state === "established") {
    return item.claimId;
  }
  if (item.state === "changed") {
    return item.series.at(-1)?.claimId;
  }
  return undefined;
}

function itemOnDocument(item: CaseItem, logicalDocumentId: string): boolean {
  return chipsForItem(item).some((chip) => chip.logicalDocumentId === logicalDocumentId);
}

function formatDisplayDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function displayValueText(value: DisplayValue): string {
  if (value.kind === "quantity" && value.numberValue != null) {
    const unit = value.unit?.trim();
    return unit ? `${value.numberValue} ${value.unit}` : String(value.numberValue);
  }
  if (value.kind === "date" && value.dateValue) {
    return formatDisplayDate(value.dateValue);
  }
  if (value.kind === "period") {
    const start = value.periodStart?.trim();
    const end = value.periodEnd?.trim();
    if (start && end) {
      return `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`;
    }
    if (end) {
      return formatDisplayDate(end);
    }
    if (start) {
      return formatDisplayDate(start);
    }
  }
  if (value.display?.trim()) {
    return value.display.trim();
  }
  return "";
}

function factFromItem(item: CaseItem, documents: CaseDocument[]): RulebookExplainerFact | null {
  if (item.state === "established") {
    const value = displayValueText(item.value);
    if (!value) {
      return null;
    }
    const root = constructRoot(item.construct.measure);
    const chip = primaryChipForItem(item);
    return {
      label: IEP_MEASURE_LABELS[root] ?? item.label,
      value,
      claimId: item.claimId,
      sourceLabel: chip ? chipSourceLabel(chip, documents) : undefined,
    };
  }
  if (item.state === "changed") {
    const latest = item.series.at(-1);
    if (!latest) {
      return null;
    }
    const value = displayValueText(latest.value);
    if (!value) {
      return null;
    }
    const root = constructRoot(item.construct.measure);
    const chip = latest.chips[0] ?? primaryChipForItem(item);
    return {
      label: IEP_MEASURE_LABELS[root] ?? item.label,
      value,
      claimId: latest.claimId,
      sourceLabel: chip ? chipSourceLabel(chip, documents) : undefined,
    };
  }
  return null;
}

function measureSectionForItem(item: CaseItem): string | null {
  if (item.state !== "established" && item.state !== "changed") {
    return null;
  }
  return iepSectionForMeasure(item.construct.measure);
}

function sortItemsForAnchor(items: CaseItem[], anchorDocId: string): CaseItem[] {
  return [...items].sort((a, b) => {
    const aOn = itemOnDocument(a, anchorDocId) ? 0 : 1;
    const bOn = itemOnDocument(b, anchorDocId) ? 0 : 1;
    return aOn - bOn;
  });
}

function factsForGuideSection(
  section: GuideSection,
  allItems: CaseItem[],
  anchorDocId: string,
  documents: CaseDocument[],
): RulebookExplainerFact[] {
  const measureSections = new Set(GUIDE_SECTION_MEASURE_SECTIONS[section.id] ?? [section.id]);
  const facts: RulebookExplainerFact[] = [];
  for (const item of sortItemsForAnchor(allItems, anchorDocId)) {
    const anatomySection = measureSectionForItem(item);
    if (!anatomySection || !measureSections.has(anatomySection)) {
      continue;
    }
    const fact = factFromItem(item, documents);
    if (!fact) {
      continue;
    }
    if (facts.some((row) => row.label === fact.label && row.value === fact.value)) {
      continue;
    }
    facts.push(fact);
  }
  return facts;
}

function sayRowsFromFacts(facts: RulebookExplainerFact[]): RulebookExplainerSayRow[] {
  return facts.map((fact) => ({
    label: fact.label,
    value: fact.value,
    sourceLabel: fact.sourceLabel ?? "Document",
    claimId: fact.claimId,
  }));
}

function sectionStatus(
  section: GuideSection,
  facts: RulebookExplainerFact[],
  docItems: CaseItem[],
): { status: RulebookSectionStatus; emptyMessage: string | null } {
  if (facts.length === 0 && section.emptyState.later?.trim()) {
    return { status: "later", emptyMessage: section.emptyState.later.trim() };
  }
  if (facts.length >= 2) {
    return { status: "found", emptyMessage: null };
  }
  if (facts.length === 1) {
    return { status: "partial", emptyMessage: null };
  }
  if (docItems.length > 0) {
    return { status: "notcaptured", emptyMessage: section.emptyState.notCaptured };
  }
  return { status: "notfound", emptyMessage: section.emptyState.notFound };
}

function sectionSummary(section: GuideSection, status: RulebookSectionStatus, facts: RulebookExplainerFact[]): string {
  const topic = section.docTitle.toLowerCase();
  if (status === "found") {
    return `Hive found ${facts.length} items about ${topic} in your documents.`;
  }
  if (status === "partial") {
    return `Hive found one item about ${topic}.`;
  }
  if (status === "later") {
    return section.emptyState.later?.trim() ?? `Transition planning may come later.`;
  }
  if (status === "notcaptured") {
    return section.emptyState.notCaptured;
  }
  return section.emptyState.notFound;
}

function resolveTerms(
  termIds: string[],
  catalog: Term[],
): Array<{ id: string; term: string; plain: string; abbr: string | null }> {
  const byId = new Map(catalog.map((t) => [t.id, t]));
  return termIds
    .map((id) => byId.get(id))
    .filter((t): t is Term => t != null)
    .map((t) => ({
      id: t.id,
      term: t.term,
      plain: t.plain,
      abbr: t.abbr?.trim() || null,
    }));
}

function resolveRules(
  ruleRefs: string[],
  catalog: Rule[],
): Array<{ ref: string; title: string; plain: string; chipLabel: string }> {
  const byRef = new Map(catalog.map((r) => [r.ref, r]));
  return ruleRefs
    .map((ref) => byRef.get(ref))
    .filter((r): r is Rule => r != null)
    .map((r) => ({
      ref: r.ref,
      title: r.title,
      plain: r.plain,
      chipLabel: formatRuleChip(r.ref),
    }));
}

function interpolatePageTitle(
  template: string,
  doc: CaseDocument,
  caseView: CaseViewV2,
): string {
  let out = template;
  const student = caseView.entities.find((e) => e.entityType.toLowerCase().includes("student"));
  const firstName = student?.displayName?.trim().split(/\s+/)[0] ?? "Your child";
  out = out.replace(/\{student\.firstName\}/g, firstName);
  const year = doc.documentDate?.slice(0, 4) ?? "plan";
  out = out.replace(/\{plan\.year\}/g, year);
  return out;
}

function tabLabelForDocument(doc: CaseDocument, guide: DocumentGuide): string {
  const short = shortDocName(doc);
  if (short.length > 0 && short.length <= 36) {
    return short;
  }
  return guide.docType.length <= 28 ? guide.docType : `${guide.docType.slice(0, 25)}…`;
}

function findPeriodOnCase(caseView: CaseViewV2): { start: string | null; end: string | null } {
  for (const item of caseView.items) {
    if (item.state !== "established" && item.state !== "changed") {
      continue;
    }
    if (constructRoot(item.construct.measure) !== "iep_period") {
      continue;
    }
    const value = item.state === "established" ? item.value : item.series.at(-1)?.value;
    if (!value || value.kind !== "period") {
      continue;
    }
    return { start: value.periodStart, end: value.periodEnd };
  }
  return { start: null, end: null };
}

function findDateMeasure(caseView: CaseViewV2, measureRoot: string): string | null {
  for (const item of caseView.items) {
    if (item.state !== "established" && item.state !== "changed") {
      continue;
    }
    if (constructRoot(item.construct.measure) !== measureRoot) {
      continue;
    }
    const value = item.state === "established" ? item.value : item.series.at(-1)?.value;
    if (!value) {
      continue;
    }
    const text = displayValueText(value);
    if (text) {
      return text;
    }
  }
  return null;
}

function buildDates(guide: DocumentGuide, caseView: CaseViewV2): RulebookExplainerDateView[] {
  if (!guide.dates?.length) {
    return [];
  }
  const period = findPeriodOnCase(caseView);
  return guide.dates.map((d: GuideDate) => {
    let value: string | null = null;
    if (d.compute === "plan.end" && period.end) {
      value = formatDisplayDate(period.end);
    } else if (d.compute.includes("plan.start") && period.start) {
      value = `About one reporting period after ${formatDisplayDate(period.start)}`;
    } else if (d.compute.includes("eligibility") || d.id === "nextReeval") {
      value = findDateMeasure(caseView, "reevaluation_planning_date");
    }
    return {
      id: d.id,
      label: d.label,
      value,
      isEstimate: d.isEstimate,
      ruleRef: d.rule ?? null,
      ruleChipLabel: d.rule ? formatRuleChip(d.rule) : null,
    };
  });
}

function buildMeta(input: {
  doc: CaseDocument;
  guide: DocumentGuide;
  domainLabel: string | null;
  caseView: CaseViewV2;
}): RulebookExplainerMeta {
  const period = findPeriodOnCase(input.caseView);
  const planPeriod =
    period.start && period.end
      ? `${formatDisplayDate(period.start)} – ${formatDisplayDate(period.end)}`
      : null;
  const documentDate = input.doc.documentDate ? formatDisplayDate(input.doc.documentDate) : null;
  const domainPill =
    input.domainLabel?.trim() ||
    (input.guide.docType.includes("Education") ? "Special education (IEP)" : input.guide.docType);
  return {
    domainPill,
    planPeriod,
    documentDate,
    primarySourceLabel: `${shortDocName(input.doc)} · p.1`,
  };
}

function buildSectionCounts(sections: RulebookExplainerSectionView[]): Record<RulebookSectionStatus, number> {
  const counts: Record<RulebookSectionStatus, number> = {
    found: 0,
    partial: 0,
    notcaptured: 0,
    later: 0,
    notfound: 0,
  };
  for (const section of sections) {
    counts[section.status] += 1;
  }
  return counts;
}

function resolveRights(
  rights: Right[],
  rules: Rule[],
): Array<{
  title: string;
  plain: string;
  rules: Array<{ ref: string; title: string; plain: string; chipLabel: string }>;
}> {
  return rights.map((right) => ({
    title: right.title,
    plain: right.plain,
    rules: resolveRules(right.rules, rules),
  }));
}

function buildExplainerForDocument(input: {
  guide: DocumentGuide;
  rules: Rule[];
  terms: Term[];
  doc: CaseDocument;
  caseView: CaseViewV2;
  domainLabel: string | null;
}): RulebookDocumentExplainerView {
  const docItems = input.caseView.items.filter((item) => itemOnDocument(item, input.doc.logicalDocumentId));
  const sections: RulebookExplainerSectionView[] = input.guide.sections.map((section) => {
    const facts = factsForGuideSection(
      section,
      input.caseView.items,
      input.doc.logicalDocumentId,
      input.caseView.documents,
    );
    const { status, emptyMessage } = sectionStatus(section, facts, docItems);
    const summary = sectionSummary(section, status, facts);
    const questions = (section.questions ?? [])
      .map((q) => (typeof q === "string" ? q : q.text))
      .filter((q): q is string => typeof q === "string" && q.trim().length > 0);
    return {
      id: section.id,
      parentTitle: section.parentTitle,
      docTitle: section.docTitle,
      status,
      statusLabel: STATUS_LABELS[status],
      summary,
      rules: resolveRules(section.rules, input.rules),
      terms: resolveTerms(section.terms, input.terms),
      facts,
      sayRows: sayRowsFromFacts(facts),
      emptyMessage: status === "found" || status === "partial" ? null : emptyMessage,
      questions,
    };
  });

  return {
    tabId: `doc:${input.doc.logicalDocumentId}`,
    tabLabel: tabLabelForDocument(input.doc, input.guide),
    logicalDocumentId: input.doc.logicalDocumentId,
    docType: input.guide.docType,
    pageTitle: interpolatePageTitle(input.guide.pageTitle, input.doc, input.caseView),
    intro: input.guide.intro,
    meta: buildMeta({
      doc: input.doc,
      guide: input.guide,
      domainLabel: input.domainLabel,
      caseView: input.caseView,
    }),
    basics: resolveTerms(input.guide.basics, input.terms),
    dates: buildDates(input.guide, input.caseView),
    sectionCounts: buildSectionCounts(sections),
    sections,
    rights: resolveRights(input.guide.rights, input.rules),
    disclaimer: input.guide.disclaimer,
  };
}

export function buildRulebookDocumentExplainers(input: {
  caseView: CaseViewV2;
  domainPackId: string | null;
  domainLabel?: string | null;
}): RulebookDocumentExplainerView[] {
  if (!input.domainPackId) {
    return [];
  }
  const pack = getDomainPackByDomainId(input.domainPackId);
  if (!pack?.rulebook) {
    return [];
  }
  const explainers: RulebookDocumentExplainerView[] = [];
  const sortedDocs = [...input.caseView.documents].sort((a, b) =>
    (a.documentDate ?? "").localeCompare(b.documentDate ?? ""),
  );

  for (const doc of sortedDocs) {
    let guide: DocumentGuide | null = null;
    for (const candidate of docTypeCandidates(doc)) {
      guide = getGuide(pack, candidate);
      if (guide) {
        break;
      }
    }
    if (!guide) {
      continue;
    }
    explainers.push(
      buildExplainerForDocument({
        guide,
        rules: pack.rulebook.rules,
        terms: pack.rulebook.terms,
        doc,
        caseView: input.caseView,
        domainLabel: input.domainLabel ?? null,
      }),
    );
  }

  return explainers;
}
