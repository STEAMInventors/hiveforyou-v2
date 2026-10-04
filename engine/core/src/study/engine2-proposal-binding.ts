/**
 * Until canonical-study-proposal/4 validation ships, OpenAI strict JSON schema remains /3.
 * This user-message line keeps production runs compatible with the v4 methodology prompt.
 */
export function engine2RuntimeProposalBindingLines(promptVersion: string): string[] {
  if (promptVersion !== "v4") {
    return [];
  }
  return [
    "Runtime proposal contract (strict JSON response format for this deployment):",
    "Return canonical-study-proposal/3 only — single snake_case `construct` per claim; `role` (never modality); evidence refs with `snippet` (never quote); missingInformation without gapKind.",
    "Quantities use value.numberValue; text uses value.textValue (see schema). Follow v4 reading methodology; output must pass /3 validation.",
    "",
  ];
}
