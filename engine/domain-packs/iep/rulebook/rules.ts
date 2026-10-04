import type { Rule } from "@hiveforyou/domain-pack-shared/rulebook/schema";

import { IEP_TERMS } from "./terms";

const AUTHORITY = "IDEA, 34 CFR Part 300";

/** Verbatim from hive-your-plan.html `RULES`. */
const HTML_RULES: Record<string, { title: string; plain: string }> = {
  "300.320(a)(1)": {
    title: "Present levels",
    plain:
      "The IEP describes how your child is doing now in school — academically and in day-to-day functioning — and how the disability affects their progress in the general curriculum.",
  },
  "300.320(a)(2)": {
    title: "Measurable annual goals",
    plain:
      "The IEP lists measurable yearly goals, academic and functional, designed to meet the needs that come from the disability.",
  },
  "300.320(a)(3)": {
    title: "Measuring and reporting progress",
    plain:
      "The IEP says how progress on each goal will be measured and when you will get progress reports — for example, quarterly with report cards.",
  },
  "300.320(a)(4)": {
    title: "Services and supports",
    plain:
      "The IEP lists the special education, related services, and supplementary aids and services your child will get, plus any program changes or supports for school staff.",
  },
  "300.320(a)(5)": {
    title: "Time with peers without disabilities",
    plain:
      "The IEP explains how much, if any, of the day your child will not be with children without disabilities in the regular class and activities.",
  },
  "300.320(a)(6)": {
    title: "State and district tests",
    plain:
      "The IEP lists any accommodations for state and district tests. If your child takes an alternate test, it explains why.",
  },
  "300.320(a)(7)": {
    title: "Start date, how often, where, how long",
    plain:
      "The IEP gives the date services start and how often, where, and for how long each service is provided.",
  },
  "300.320(b)": {
    title: "Transition planning",
    plain:
      "Starting no later than the IEP in effect when your child turns 16 (earlier if the team decides), the IEP includes goals for life after high school and the services to get there.",
  },
  "300.324(a)": {
    title: "What the team considers",
    plain:
      "In writing the IEP, the team considers your child’s strengths, your concerns, evaluation results, and your child’s academic, developmental, and functional needs — plus special factors such as behavior, language, communication, and assistive technology.",
  },
  "300.324(b)": {
    title: "Review at least once a year",
    plain:
      "The team reviews the IEP at least once a year to see whether goals are being met, and revises it to address any lack of expected progress.",
  },
  "300.303": {
    title: "Reevaluation",
    plain:
      "Your child is reevaluated at least once every 3 years (unless you and the school agree it isn’t needed), and not more than once a year unless you agree. You or a teacher can request one.",
  },
  "300.106": {
    title: "Extended school year",
    plain:
      "Services beyond the normal school year are provided if the IEP team decides they are necessary for your child.",
  },
  "300.322": {
    title: "Taking part in meetings",
    plain:
      "The school takes steps so you can attend and take part in IEP meetings, and gives you a copy of the IEP at no cost.",
  },
  "300.300": {
    title: "Consent",
    plain:
      "The school needs your written consent before an initial evaluation, before first providing services, and before a reevaluation (with limited exceptions).",
  },
  "300.503": {
    title: "Prior written notice",
    plain:
      "Before the school proposes or refuses to change your child’s identification, evaluation, placement, or services, it gives you a written notice explaining what and why.",
  },
  "300.502": {
    title: "Independent evaluation",
    plain:
      "If you disagree with the school’s evaluation, you can ask for an independent educational evaluation at public expense, subject to certain conditions.",
  },
  "300.504": {
    title: "Procedural safeguards notice",
    plain:
      "The school gives you a written explanation of your rights at least once a year and at certain other times.",
  },
};

function rulesFromHtmlAndTerms(): Rule[] {
  const byRef = new Map<string, Rule>();
  for (const [section, summary] of Object.entries(HTML_RULES)) {
    byRef.set(`idea:${section}`, {
      ref: `idea:${section}`,
      title: summary.title,
      plain: summary.plain,
      authority: AUTHORITY,
    });
  }
  for (const term of IEP_TERMS) {
    for (const cite of term.cites) {
      if (!byRef.has(cite.ref)) {
        byRef.set(cite.ref, {
          ref: cite.ref,
          title: term.term,
          plain: "",
          authority: AUTHORITY,
        });
      }
    }
  }
  return [...byRef.values()].sort((a, b) => a.ref.localeCompare(b.ref));
}

export const IEP_RULES: Rule[] = rulesFromHtmlAndTerms();
