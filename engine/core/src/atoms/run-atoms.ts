import type { AssembledDocument } from "../document/assembly";
import type { DocumentPages } from "../document/page-model";
import type { CallModel } from "../model/call-model";
import { matchParties } from "./match";
import { runTier1Semantic } from "./semantic";
import { linkSectionSubjects } from "./section-subject";
import { extractTier0Structural } from "./structural";
import { validateAtoms } from "./validate";
import type { Party, Statement, Thing } from "./types";
import type { DocumentProfile } from "./types";

export type AtomsRunResult = {
  tier0: Statement[];
  statements: Statement[];
  parties: Party[];
  things: Thing[];
  profiles: DocumentProfile[];
  partyMatches: ReturnType<typeof matchParties>;
  validationDrops: Record<string, number>;
  usage: { tier1: { inputTokens: number; outputTokens: number } };
};

export async function runAtomsForDocument(input: {
  pages: DocumentPages;
  assembled: AssembledDocument;
  callModel: CallModel;
  model: string;
  issuedDate?: string | null;
}): Promise<AtomsRunResult> {
  const tier0 = extractTier0Structural({
    pages: input.pages,
    assembled: input.assembled,
    issuedDate: input.issuedDate,
  });

  const tier1 = await runTier1Semantic({
    assembled: input.assembled,
    callModel: input.callModel,
    model: input.model,
  });

  const combinedStatements = [...tier0.statements, ...tier1.statements];
  const { validated, metrics } = validateAtoms({
    assembled: input.assembled,
    pages: input.pages,
    statements: combinedStatements,
    parties: tier1.parties,
    things: tier0.things,
    references: tier1.references,
    terms: tier1.terms,
    profiles: [tier1.profile],
  });

  const partyMatches = matchParties(validated.parties);
  const statements = linkSectionSubjects({
    assembled: input.assembled,
    statements: validated.statements,
  });

  return {
    tier0: tier0.statements,
    statements,
    parties: validated.parties,
    things: validated.things,
    profiles: validated.profiles,
    partyMatches,
    validationDrops: metrics.dropsByReason,
    usage: { tier1: tier1.usage },
  };
}
