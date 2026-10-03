import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { getDomainPackByDomainId, listDomainPackManifests } from "@hiveforyou/domain-pack";
import "@hiveforyou/domain-packs";

import { validate } from "../domain-packs/_shared/rulebook/validate.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const packsRoot = join(repoRoot, "domain-packs");

function findTodos(text: string, fileLabel: string): string[] {
  const lines = text.split("\n");
  const hits: string[] = [];
  lines.forEach((line, index) => {
    if (line.includes("TODO(review)")) {
      hits.push(`${fileLabel}:${index + 1}`);
    }
  });
  return hits;
}

function walkTsFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory() && entry !== ".audit" && entry !== "node_modules") {
      out.push(...walkTsFiles(path));
    } else if (entry.endsWith(".ts")) {
      out.push(path);
    }
  }
  return out;
}

function loadReviewMeta(domainId: string): {
  missingRuleSummaries: string[];
  unmappedSlots: string[];
  unmappedQuestions: string[];
} {
  const path = join(packsRoot, domainId, "rulebook", "review-meta.ts");
  if (!existsSync(path)) {
    return { missingRuleSummaries: [], unmappedSlots: [], unmappedQuestions: [] };
  }
  const text = readFileSync(path, "utf8");
  const readArray = (name: string): string[] => {
    const match = text.match(new RegExp(`export const ${name}[^=]*=\\s*\\[([^\\]]*)\\]`, "s"));
    if (!match) {
      return [];
    }
    return [...match[1]!.matchAll(/"([^"]+)"|'([^']+)'/g)].map((m) => m[1] ?? m[2]!);
  };
  return {
    missingRuleSummaries: readArray("missingRuleSummaries"),
    unmappedSlots: readArray("unmappedSlots"),
    unmappedQuestions: readArray("unmappedQuestions"),
  };
}

function main(): void {
  for (const manifest of listDomainPackManifests()) {
    const domainId = manifest.id;
    const rulebookDir = join(packsRoot, domainId, "rulebook");
    const pack = getDomainPackByDomainId(domainId);
    const meta = loadReviewMeta(domainId);
    const todos: string[] = [];
    for (const file of walkTsFiles(rulebookDir)) {
      todos.push(...findTodos(readFileSync(file, "utf8"), file.replace(repoRoot + "\\", "").replace(repoRoot + "/", "")));
    }

    const guides =
      pack?.rulebook?.guides.map((g) => `- ${g.docType}: kind=${g.kind}, status=${g.reviewStatus}`) ??
      ["- (no rulebook loaded on pack)"];

    let validationErrors: string[] = [];
    if (pack?.rulebook) {
      const result = validate(pack.rulebook, pack);
      if (!result.ok) {
        validationErrors = result.errors;
      }
    }

    const md = `# Rulebook review — ${domainId}

## Guides
${guides.join("\n")}

## TODO(review) locations
${todos.length ? todos.map((t) => `- ${t}`).join("\n") : "- none"}

## missingRuleSummaries
${meta.missingRuleSummaries.length ? meta.missingRuleSummaries.map((r) => `- ${r}`).join("\n") : "- none"}

## unmappedSlots
${meta.unmappedSlots.length ? meta.unmappedSlots.map((s) => `- ${s}`).join("\n") : "- none"}

## unmappedQuestions
${meta.unmappedQuestions.length ? meta.unmappedQuestions.map((q) => `- ${q}`).join("\n") : "- none"}

## Validation errors
${validationErrors.length ? validationErrors.map((e) => `- ${e}`).join("\n") : "- none"}
`;
    writeFileSync(join(rulebookDir, "REVIEW.md"), md);
    console.log(`Wrote ${join(rulebookDir, "REVIEW.md")}`);
  }
}

main();
