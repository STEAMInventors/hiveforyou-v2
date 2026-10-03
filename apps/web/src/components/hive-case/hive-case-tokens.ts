export const hiveCaseFont =
  "var(--font-dm-sans), 'DM Sans', system-ui, sans-serif" as const;

export const hiveCaseMono =
  "var(--font-jetbrains-mono), 'JetBrains Mono', ui-monospace, monospace" as const;

export const hiveColors = {
  text: "#202124",
  muted: "#5F6368",
  border: "#E3E3E3",
  borderLight: "#EDEDED",
  blue: "#1967D2",
  blueBg: "#E8F0FE",
  chipBg: "#FEF7E0",
  chipBorder: "#F6D58A",
  green: "#188038",
  yellow: "#B06000",
  askBlue: "#4285F4",
} as const;

export type HiveCaseCoreTab = "story" | "plan" | "timeline" | "meeting-prep";

/** Core tabs plus one tab per rulebook-backed document (`doc:<logicalDocumentId>`). */
export type HiveCaseTab = HiveCaseCoreTab | `doc:${string}`;

export function isDocumentExplainerTab(tab: HiveCaseTab): tab is `doc:${string}` {
  return tab.startsWith("doc:");
}
