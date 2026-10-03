import type { DocumentGuide } from "@hiveforyou/domain-pack-shared/rulebook/schema";

export const MEDICAID_NOTICE_GUIDE: DocumentGuide = {
  kind: "notice-guide",
  reviewStatus: "draft",
  docType: "Notice of Action",
  pageTitle: "Your {notice.date} Medicaid notice",
  intro:
    "What the letter says, what the rules say a notice includes, and the dates that matter.",
  basics: ["noa", "fairhearing", "aidpending", "effdate"],
  sections: [
    {
      id: "action",
      parentTitle: "What the agency is doing",
      docTitle: "Action",
      rules: ["mcd:431.210"],
      terms: ["noa", "effdate"],
      slots: ["notice.action", "notice.service", "notice.effectiveDate"],
      required: true,
      emptyState: {
        notFound: "The letter doesn’t say what action is being taken.",
        notCaptured: "Hive couldn’t read the action in this letter.",
      },
      questions: [
        {
          when: "notice.service",
          ask: "Which exact service or amount does the {notice.action} apply to?",
        },
      ],
    },
    {
      id: "reasons",
      parentTitle: "Why",
      docTitle: "Reason for action",
      rules: ["mcd:431.210"],
      terms: [],
      slots: ["notice.reason", "notice.ruleCited"],
      required: true,
      emptyState: {
        notFound: "The letter doesn’t state a reason.",
        notCaptured: "Hive couldn’t read the reason in this letter.",
      },
      questions: [
        {
          when: "!notice.ruleCited",
          ask: "Which rule does the agency rely on for this decision?",
        },
      ],
    },
    {
      id: "hearing",
      parentTitle: "How to disagree",
      docTitle: "Your right to a fair hearing",
      rules: ["mcd:431.210", "mcd:431.221", "mcd:431.230"],
      terms: ["fairhearing", "aidpending"],
      slots: ["notice.hearingDeadline", "notice.hearingMethod"],
      required: true,
      emptyState: {
        notFound: "The letter doesn’t explain how to ask for a hearing.",
        notCaptured: "Hive couldn’t read the hearing section.",
      },
      questions: [
        {
          when: "notice.effectiveDate",
          ask: "If I ask for a hearing before {notice.effectiveDate}, will my benefits continue?",
        },
      ],
    },
  ],
  dates: [
    {
      id: "effective",
      label: "Change takes effect",
      rule: "mcd:431.211",
      compute: "notice.effectiveDate",
      isEstimate: false,
    },
    {
      id: "keepBenefits",
      label: "Ask for a hearing by this date to keep benefits",
      rule: "mcd:431.230",
      compute: "notice.effectiveDate",
      isEstimate: false,
    },
    {
      id: "hearingBy",
      label: "Last day to ask for a hearing",
      rule: "mcd:431.221",
      compute: "notice.hearingDeadline ?? notice.mailedDate + 90d",
      isEstimate: true,
    },
  ],
  rights: [
    {
      title: "Ask for a hearing",
      plain: "You can ask for a fair hearing if you disagree.",
      rules: ["mcd:431.221"],
      terms: ["fairhearing"],
    },
    {
      title: "Keep benefits while you wait",
      plain:
        "Asking before the effective date generally keeps your benefits going until the decision.",
      rules: ["mcd:431.230"],
      terms: ["aidpending"],
    },
  ],
  disclaimer:
    "This explains federal Medicaid rules in plain language. Your state sets its own deadlines and process. Hive helps you prepare — it isn’t legal advice.",
};
