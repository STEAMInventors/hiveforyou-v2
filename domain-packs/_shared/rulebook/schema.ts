/**
 * Rulebook — domain-agnostic schema.
 *
 * Every domain pack ships a rulebook. A rulebook explains the documents in that
 * domain that a non-expert needs help reading (IEP, Medicaid notice of action,
 * bankruptcy schedules, ...). All content is general, human-reviewed, and cites
 * its source rule. No case data lives here; the case page fills it at runtime.
 *
 * Ownership: rulebook text is authored + reviewed by people. The model never
 * writes or paraphrases rulebook text at runtime. Code joins rulebook entries to
 * case facts by slot id.
 */

export type ReviewStatus = "draft" | "reviewed";

export type HandlingKind =
  | "document-guide"
  | "notice-guide"
  | "glossary-only"
  | "none";

export type Citation = {
  code: string;
  ref: string;
};

export type Rule = {
  ref: string;
  title: string;
  plain: string;
  authority: string;
  url?: string;
};

export type Term = {
  id: string;
  abbr?: string;
  term: string;
  plain: string;
  cites: Citation[];
  source: "regulation" | "common";
  aka?: string[];
};

export type GuideSection = {
  id: string;
  parentTitle: string;
  docTitle: string;
  rules: string[];
  terms: string[];
  slots: string[];
  format?: Record<string, string>;
  required: boolean | { when: string };
  emptyState: { notFound: string; notCaptured: string; later?: string };
  questions: QuestionTemplate[];
};

export type QuestionTemplate = {
  when: string;
  ask: string;
};

export type DerivedDate = {
  id: string;
  label: string;
  rule: string;
  compute: string;
  isEstimate: boolean;
};

export type Right = { title: string; plain: string; rules: string[]; terms?: string[] };

export type DocumentGuide = {
  kind: Exclude<HandlingKind, "none">;
  reviewStatus: ReviewStatus;
  docType: string;
  pageTitle: string;
  intro: string;
  basics: string[];
  /** Slot ids shown in the Pro view header (must not be boolean-valued slots). */
  headerSlots?: string[];
  sections: GuideSection[];
  dates: DerivedDate[];
  rights: Right[];
  disclaimer: string;
};

export type Rulebook = {
  domain: string;
  jurisdiction: string;
  reviewStatus: ReviewStatus;
  version: string;
  rules: Rule[];
  terms: Term[];
  guides: DocumentGuide[];
};

export type RulebookOverlay = {
  jurisdiction: string;
  extendsDomain: string;
  addRules?: Rule[];
  addTerms?: Term[];
  termAka?: Record<string, string[]>;
  dateOverrides?: Record<string, Partial<DerivedDate>>;
  sectionAdds?: Record<string, Partial<GuideSection>>;
};

/**
 * Load-time validation (see validate.ts):
 * - every GuideSection.rules / Right.rules entry exists in rules[]
 * - every GuideSection.terms / basics entry exists in terms[]
 * - every '{slot}' in questions/format/pageTitle is declared in the pack's slot list
 * - every GuideSection.slots[] entry exists in the pack's slot list
 * - every DocumentGuide.docType exists in the pack's document types
 * - term ids unique per domain; rule refs unique per domain
 * - no Rule.plain, Term.plain, Question.ask, Right.plain contains verdict words
 * - every Term with source 'regulation' has at least one cite
 */
