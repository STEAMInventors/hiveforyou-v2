export type IntakeWorkPurpose =
  | {
      mode: "DOMAIN";
      /** Registered Domain Pack id. */
      selectedDomainId: string;
    }
  | {
      mode: "DESCRIBED";
      rawIntent: string;
    };

export const PURPOSE_MENU_PROMPT = "What are you working on?";

export const PURPOSE_DESCRIBED_PROMPT = "What are you trying to understand?";

export const PURPOSE_DESCRIBED_PLACEHOLDER =
  "Tell me a little about what you're working on...";

export function purposeTriggerLabel(
  purpose: IntakeWorkPurpose | null,
  domainName?: string,
): string {
  if (!purpose) {
    return PURPOSE_MENU_PROMPT;
  }
  if (purpose.mode === "DOMAIN") {
    return domainName?.trim() || purpose.selectedDomainId;
  }
  return "Other";
}

export function isDescribedIntentReady(draft: string): boolean {
  return draft.trim().length > 0;
}
