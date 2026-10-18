export type IntakePreRunPhase = "committing" | "starting-intake" | null;

export function intakePreRunSubtitle(
  phase: IntakePreRunPhase,
  documentCount: number,
): string | null {
  if (!phase) {
    return null;
  }
  if (phase === "committing") {
    return documentCount > 1
      ? `Saving ${documentCount} documents to secure storage…`
      : "Saving your document to secure storage…";
  }
  return documentCount > 1
    ? "Registering your files with this hive…"
    : "Registering your file with this hive…";
}

/** Keep progress on the first intake stage while commit / start requests run. */
export function intakePreRunStepIndex(phase: IntakePreRunPhase): number | null {
  return phase ? 0 : null;
}
