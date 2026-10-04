import type { DocumentGuide } from "@hiveforyou/domain-pack-shared/rulebook/schema";

import { IEP_TERM_SECTIONS } from "../terms";

export const IEP_DOCUMENT_GUIDE: DocumentGuide = {
  kind: "document-guide",
  reviewStatus: "reviewed",
  docType: "Individualized Education Program",
  pageTitle: "{student.firstName}'s {plan.year} IEP",
  intro: "What the plan says, what the rules say a plan includes, and what to ask.",
  basics: IEP_TERM_SECTIONS.basics,
  headerSlots: ["eligibility.category", "plan.period", "school.name"],
  sections: [
    {
      id: "present",
      parentTitle: "Where your child is now",
      docTitle: "Present levels",
      rules: ["idea:300.320(a)(1)"],
      terms: IEP_TERM_SECTIONS.present,
      slots: ["prior.goal.baseline"],
      required: true,
      emptyState: {
        notFound: "The written present levels section wasn’t found in your document.",
        notCaptured:
          "Hive didn’t capture the written present levels section of the IEP. If it’s in the document, Hive may have missed it; if it isn’t, that’s worth asking about.",
      },
      questions: [],
    },
    {
      id: "goals",
      parentTitle: "What your child is working toward",
      docTitle: "Measurable annual goals",
      rules: ["idea:300.320(a)(2)", "idea:300.324(b)"],
      terms: IEP_TERM_SECTIONS.goals,
      slots: [
        "prior.goal.baseline",
        "prior.goal.target",
        "goal.reading.fluency",
        "goal.reading.comprehension",
      ],
      required: true,
      emptyState: {
        notFound: "No measurable annual goals were found in your document.",
        notCaptured: "Hive couldn’t read the goals section in your document.",
      },
      questions: [
        {
          when: "dropped",
          ask: "The prior fluency goal was not met — what supports will help with the new comprehension goal?",
        },
      ],
    },
    {
      id: "progress",
      parentTitle: "How you’ll hear about progress",
      docTitle: "Measuring and reporting progress",
      rules: ["idea:300.320(a)(3)"],
      terms: IEP_TERM_SECTIONS.progress,
      slots: [],
      required: true,
      emptyState: {
        notFound: "Progress reporting wasn’t found in your document.",
        notCaptured: "Hive couldn’t read how progress will be measured and reported.",
      },
      questions: [],
    },
    {
      id: "services",
      parentTitle: "Services your child receives",
      docTitle: "Special education and related services",
      rules: ["idea:300.320(a)(4)", "idea:300.320(a)(7)"],
      terms: IEP_TERM_SECTIONS.services,
      slots: [],
      required: true,
      emptyState: {
        notFound: "Services weren’t listed in your document.",
        notCaptured: "Hive couldn’t read special education and related services.",
      },
      questions: [],
    },
    {
      id: "supports",
      parentTitle: "Supports in class and on tests",
      docTitle: "Supplementary aids, accommodations, and state/district tests",
      rules: ["idea:300.320(a)(4)", "idea:300.320(a)(6)"],
      terms: IEP_TERM_SECTIONS.supports,
      slots: [],
      required: true,
      emptyState: {
        notFound: "Accommodations or supports weren’t found in your document.",
        notCaptured: "Hive couldn’t read accommodations and supplementary aids.",
      },
      questions: [],
    },
    {
      id: "lre",
      parentTitle: "Time with classmates",
      docTitle: "Participation with peers without disabilities",
      rules: ["idea:300.320(a)(5)"],
      terms: IEP_TERM_SECTIONS.lre,
      slots: [],
      required: true,
      emptyState: {
        notFound: "Time with peers without disabilities wasn’t explained in your document.",
        notCaptured: "Hive didn’t capture the IEP’s explanation of time outside the regular class.",
      },
      questions: [],
    },
    {
      id: "factors",
      parentTitle: "Other things the team considered",
      docTitle: "Special factors and parent concerns",
      rules: ["idea:300.324(a)"],
      terms: IEP_TERM_SECTIONS.factors,
      slots: ["eligibility.category", "eligibility.primaryNeed"],
      questions: [
        {
          when: "changed",
          ask: "Why did the team change the main area of need from reading fluency to reading comprehension?",
        },
      ],
      required: true,
      emptyState: {
        notFound: "Special factors or parent concerns weren’t found in your document.",
        notCaptured:
          "Hive didn’t capture a parent-concerns section or special factors (behavior, language, communication, assistive technology).",
      },
    },
    {
      id: "esy",
      parentTitle: "Summer services",
      docTitle: "Extended school year",
      rules: ["idea:300.106"],
      terms: IEP_TERM_SECTIONS.esy,
      slots: [],
      required: false,
      emptyState: {
        notFound: "No extended school year decision was found in your document.",
        notCaptured: "Hive didn’t find an extended school year decision in what it read.",
      },
      questions: [],
    },
    {
      id: "transition",
      parentTitle: "Planning for after high school",
      docTitle: "Transition services",
      rules: ["idea:300.320(b)"],
      terms: IEP_TERM_SECTIONS.transition,
      slots: [],
      required: { when: "student.age >= 16" },
      emptyState: {
        notFound: "Transition services weren’t found in your document.",
        notCaptured: "Hive didn’t capture transition planning in your document.",
        later:
          "Transition planning begins by the IEP in effect when a child turns 16 (earlier if the team decides).",
      },
      questions: [],
    },
  ],
  dates: [
    {
      id: "annualReview",
      label: "Annual review due by",
      rule: "idea:300.324(b)",
      compute: "plan.end",
      isEstimate: false,
    },
    {
      id: "firstProgressReport",
      label: "First progress report around",
      rule: "idea:300.320(a)(3)",
      compute: "plan.start + 1 reporting period",
      isEstimate: true,
    },
    {
      id: "nextReeval",
      label: "Next reevaluation due by",
      rule: "idea:300.303",
      compute: "eligibility.date + 3y",
      isEstimate: true,
    },
  ],
  rights: [
    {
      title: "Be part of every IEP meeting",
      plain: "You’re a member of the IEP team. The school schedules meetings so you can attend.",
      rules: ["idea:300.322"],
      terms: ["iepteam"],
    },
    {
      title: "Get a free copy of the IEP",
      plain: "The school gives you a copy at no cost.",
      rules: ["idea:300.322"],
    },
    {
      title: "Get it in writing first",
      plain:
        "Before the school changes (or refuses to change) services or placement, you get a written notice saying what and why.",
      rules: ["idea:300.503"],
      terms: ["pwn"],
    },
    {
      title: "Give or refuse consent",
      plain:
        "Your written consent is needed before an initial evaluation, first services, and a reevaluation.",
      rules: ["idea:300.300"],
      terms: ["consent"],
    },
    {
      title: "Ask for an outside evaluation",
      plain:
        "If you disagree with the school’s evaluation, you can request an independent one at public expense, with conditions.",
      rules: ["idea:300.502"],
      terms: ["iee"],
    },
    {
      title: "Ask for a reevaluation",
      plain: "You can request one — up to once a year unless you and the school agree otherwise.",
      rules: ["idea:300.303"],
      terms: ["reeval"],
    },
    {
      title: "Get your rights in writing",
      plain: "The school gives you a procedural safeguards notice at least once a year.",
      rules: ["idea:300.504"],
      terms: ["psn"],
    },
  ],
  disclaimer:
    "This explains the federal special education rules (IDEA, 34 CFR Part 300) in plain language. Your state may add its own requirements and timelines. Hive helps you prepare questions — it isn’t legal advice.",
};
