import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type LoadedDiscoverResolutionPrompt = {
  id: "discover-resolution";
  version: string;
  content: string;
  sha256: string;
};

const VERSION_FILES: Record<string, { version: string; fileName: string }> = {
  v1: { version: "v1", fileName: "discover-resolution-v1.md" },
  "discover-resolution-v1": { version: "v1", fileName: "discover-resolution-v1.md" },
};

function promptDirectories(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    join(here, "../../prompts/discover"),
    join(process.cwd(), "prompts/discover"),
    join(process.cwd(), "engine/core/prompts/discover"),
    join(process.cwd(), "../../engine/core/prompts/discover"),
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
  throw new Error(`Unknown discover resolution prompt file: ${fileName}`);
}

export function loadDiscoverResolutionPrompt(
  version: string = "discover-resolution-v1",
): LoadedDiscoverResolutionPrompt {
  const requested = version.trim();
  const mapped = VERSION_FILES[requested] ?? VERSION_FILES["discover-resolution-v1"];
  const filePath = resolvePromptFile(mapped!.fileName);
  const content = readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
  const sha256 = createHash("sha256").update(content).digest("hex");
  return {
    id: "discover-resolution",
    version: mapped!.version,
    content,
    sha256,
  };
}
