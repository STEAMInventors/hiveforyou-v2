import type { Rule } from "@hiveforyou/domain-pack-shared/rulebook/schema";

const AUTHORITY = "42 CFR Part 431";

export const MEDICAID_RULES: Rule[] = [
  {
    ref: "mcd:431.210",
    authority: AUTHORITY,
    title: "What the notice includes",
    plain:
      "A notice about an action on your benefits states what the agency intends to do, the reasons, the rules that support it, your right to a hearing, how to ask for one, and when benefits can continue while you wait.",
  },
  {
    ref: "mcd:431.211",
    authority: AUTHORITY,
    title: "Advance notice",
    plain:
      "In most cases the agency sends the notice at least 10 days before the date the action takes effect.",
  },
  {
    ref: "mcd:431.221",
    authority: AUTHORITY,
    title: "Time to ask for a hearing",
    plain:
      "You get a reasonable time to request a hearing — no more than 90 days from the date the notice is mailed. Your state sets the exact deadline.",
  },
  {
    ref: "mcd:431.230",
    authority: AUTHORITY,
    title: "Keeping benefits during a hearing",
    plain:
      "If you ask for a hearing before the action takes effect, benefits generally continue until the hearing decision, with some exceptions.",
  },
];
