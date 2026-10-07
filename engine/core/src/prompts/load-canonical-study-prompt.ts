import { createHash } from "node:crypto";

import { hasBundledPrompt, loadBundledPromptContent } from "./load-prompt-content";

export type LoadedCanonicalStudyPrompt = {
  id: "canonical-study";
  version: string;
  content: string;
  sha256: string;
};

export class UnknownPromptVersionError extends Error {
  readonly code = "UNKNOWN_PROMPT_VERSION";

  constructor(version: string) {
    super(`Unknown canonical study prompt version: ${version}`);
    this.name = "UnknownPromptVersionError";
  }
}

const VERSION_FILES: Record<string, { version: string; fileName: string }> = {
  v1: { version: "v1", fileName: "canonical-study-v1.md" },
  "canonical-study-v1": { version: "v1", fileName: "canonical-study-v1.md" },
  v2: { version: "v2", fileName: "canonical-study-v2.md" },
  "canonical-study-v2": { version: "v2", fileName: "canonical-study-v2.md" },
  v3: { version: "v3", fileName: "canonical-study-v3.md" },
  "canonical-study-v3": { version: "v3", fileName: "canonical-study-v3.md" },
  v4: { version: "v4", fileName: "canonical-study-v4.md" },
  "canonical-study-v4": { version: "v4", fileName: "canonical-study-v4.md" },
  "v4.1": { version: "v4.1", fileName: "canonical-study-v4.1.md" },
  "canonical-study-v4.1": { version: "v4.1", fileName: "canonical-study-v4.1.md" },
};

function resolvePromptKey(fileName: string): string {
  const key = `canonical-study/${fileName}`;
  if (!hasBundledPrompt(key)) {
    throw new UnknownPromptVersionError(fileName);
  }
  return key;
}

/**
 * Loads a version-controlled Engine 2 prompt file.
 * Unknown versions and the unpinned alias "latest" fail closed.
 */
export function loadCanonicalStudyPrompt(version: string): LoadedCanonicalStudyPrompt {
  const requested = version.trim();
  if (!requested || requested.toLowerCase() === "latest") {
    throw new UnknownPromptVersionError(version);
  }
  const mapped = VERSION_FILES[requested];
  if (!mapped) {
    throw new UnknownPromptVersionError(requested);
  }
  resolvePromptKey(mapped.fileName);
  const content = loadBundledPromptContent(`canonical-study/${mapped.fileName}`);
  const sha256 = createHash("sha256").update(content).digest("hex");
  return {
    id: "canonical-study",
    version: mapped.version,
    content,
    sha256,
  };
}

/** True for v4 and its revisions (v4.1, ...): they run the v4 engine and the /4 schema. */
export function isV4PromptVersion(version: string): boolean {
  return version === "v4" || version.startsWith("v4.");
}
