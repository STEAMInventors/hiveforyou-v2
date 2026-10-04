import type { CaseViewV2, PackNarrativeOutput, ValidatedStoryProse } from "@hiveforyou/shared/projections";

/** Pack template narrative reads better than one-fact-per-sentence model prose. */
export function shouldPreferPackNarrativeOverValidatedStory(input: {
  packNarrative: PackNarrativeOutput | null | undefined;
  validatedProse: ValidatedStoryProse | null | undefined;
}): boolean {
  const pack = input.packNarrative;
  const prose = input.validatedProse;
  if (!pack?.paragraphs.length) {
    return false;
  }
  if (!prose?.paragraphs.length) {
    return true;
  }
  const vSentences = prose.paragraphs.flatMap((p) => p.sentences);
  const pSentences = pack.paragraphs.flatMap((p) => p.sentences);
  const avgLen =
    vSentences.reduce((sum, s) => sum + s.text.length, 0) / Math.max(vSentences.length, 1);
  const oneFactPerSentence =
    vSentences.length > 0 && vSentences.every((s) => (s.factIds?.length ?? 0) <= 1);
  return (
    pSentences.length > vSentences.length ||
    avgLen < 72 ||
    (oneFactPerSentence && vSentences.length >= 4)
  );
}

export function shouldPreferPackForCaseView(
  caseView: Pick<CaseViewV2, "packNarrative" | "validatedStory">,
): boolean {
  const validatedProse =
    caseView.validatedStory?.kind === "prose" ? caseView.validatedStory.story : null;
  return shouldPreferPackNarrativeOverValidatedStory({
    packNarrative: caseView.packNarrative,
    validatedProse,
  });
}
