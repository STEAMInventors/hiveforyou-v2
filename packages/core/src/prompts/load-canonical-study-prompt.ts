import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
};

function promptDirectories(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    join(here, "../../prompts/canonical-study"),
    join(process.cwd(), "prompts/canonical-study"),
    join(process.cwd(), "packages/core/prompts/canonical-study"),
    join(process.cwd(), "../../packages/core/prompts/canonical-study"),
  ];
}

function resolvePromptFile(fileName: string): string {
  for (const directory of promptDirectories()) {
    const candidate = join(directory, fileName);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new UnknownPromptVersionError(fileName);
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
  const filePath = resolvePromptFile(mapped.fileName);
  const content = readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
  const sha256 = createHash("sha256").update(content).digest("hex");
  return {
    id: "canonical-study",
    version: mapped.version,
    content,
    sha256,
  };
}
