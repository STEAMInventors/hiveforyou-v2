import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type LoadedDiscoverPrompt = {
  id: "discover";
  version: string;
  content: string;
  sha256: string;
};

export class UnknownDiscoverPromptVersionError extends Error {
  readonly code = "UNKNOWN_DISCOVER_PROMPT_VERSION";

  constructor(version: string) {
    super(`Unknown discover prompt version: ${version}`);
    this.name = "UnknownDiscoverPromptVersionError";
  }
}

const VERSION_FILES: Record<string, { version: string; fileName: string }> = {
  v1: { version: "v1", fileName: "discover-v1.md" },
  "discover-v1": { version: "v1", fileName: "discover-v1.md" },
  v2: { version: "v2", fileName: "discover-v2.md" },
  "discover-v2": { version: "v2", fileName: "discover-v2.md" },
};

function promptDirectories(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    join(here, "../../prompts/discover"),
    join(process.cwd(), "prompts/discover"),
    join(process.cwd(), "packages/core/prompts/discover"),
    join(process.cwd(), "../../packages/core/prompts/discover"),
  ];
}

function resolvePromptFile(fileName: string): string {
  for (const directory of promptDirectories()) {
    const candidate = join(directory, fileName);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new UnknownDiscoverPromptVersionError(fileName);
}

/**
 * Loads a version-controlled Engine 1 prompt file.
 * Unknown versions and the unpinned alias "latest" fail closed.
 */
export function loadDiscoverPrompt(version: string): LoadedDiscoverPrompt {
  const requested = version.trim();
  if (!requested || requested.toLowerCase() === "latest") {
    throw new UnknownDiscoverPromptVersionError(version);
  }
  const mapped = VERSION_FILES[requested];
  if (!mapped) {
    throw new UnknownDiscoverPromptVersionError(requested);
  }
  const filePath = resolvePromptFile(mapped.fileName);
  const content = readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
  const sha256 = createHash("sha256").update(content).digest("hex");
  return {
    id: "discover",
    version: mapped.version,
    content,
    sha256,
  };
}
