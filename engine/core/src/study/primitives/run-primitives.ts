import type { AssembledDocument } from "../../document/assembly";
import type { EntityMatch } from "../../atoms/match";
import type { DocumentProfile, Statement } from "../../atoms/types";
import { arithmeticFindings } from "./arithmetic";
import { requirementCoverageFindings } from "./requirementCoverage";
import { restatementFindings } from "./restatement";
import { seriesContinuityFindings } from "./seriesContinuity";
import type { StudyFinding } from "./types";

export function runPrimitives(input: {
  assembled: AssembledDocument;
  statements: Statement[];
  profiles: DocumentProfile[];
  partyMatches: EntityMatch[];
  accountIdByDocument?: Map<string, string>;
}): StudyFinding[] {
  const accountIdByDocument = input.accountIdByDocument ?? new Map<string, string>();
  return [
    ...restatementFindings({ statements: input.statements, partyMatches: input.partyMatches }),
    ...arithmeticFindings({ assembled: input.assembled, statements: input.statements }),
    ...seriesContinuityFindings({
      profiles: input.profiles,
      accountIdByDocument,
      partyMatches: input.partyMatches,
    }),
    ...requirementCoverageFindings({ profiles: input.profiles }),
  ];
}
