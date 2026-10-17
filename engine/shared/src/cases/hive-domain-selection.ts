export function hiveDomainConflictsWithComposer(input: {
  establishedDomainId: string | null | undefined;
  composerExplicitDomainId: string | null | undefined;
}): boolean {
  const established = input.establishedDomainId?.trim();
  const composer = input.composerExplicitDomainId?.trim();
  if (!established || !composer) {
    return false;
  }
  return established !== composer;
}