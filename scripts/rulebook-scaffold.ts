import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { listDomainPackManifests } from "@hiveforyou/domain-pack";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const packsRoot = join(repoRoot, "engine/domain-packs");

function kebabDocType(docType: string): string {
  return docType
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function writeIfMissing(path: string, content: string, created: string[]): void {
  if (existsSync(path)) {
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  created.push(path);
}

function appendTerms(
  termsPath: string,
  termsNeeded: { word: string; abbr: string | null }[],
  created: string[],
): void {
  let existing = "";
  if (existsSync(termsPath)) {
    existing = readFileSync(termsPath, "utf8");
  } else {
    existing = `import type { Term } from "@hiveforyou/domain-pack-shared/rulebook/schema";\n\nexport const TERMS: Term[] = [\n];\n`;
    writeIfMissing(termsPath, existing, created);
    existing = readFileSync(termsPath, "utf8");
  }
  for (const entry of termsNeeded) {
    const id = (entry.abbr ?? entry.word)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 24);
    const re = new RegExp(`id:\\s*['"]${id}['"]|term:\\s*['"]${entry.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"]`, "i");
    if (re.test(existing)) {
      continue;
    }
    const block = `  {
    id: '${id}',
    ${entry.abbr ? `abbr: '${entry.abbr}',` : ""}
    term: '${entry.word.replace(/'/g, "\\'")}',
    plain: 'TODO(review)',
    cites: [],
    source: 'common',
  },`;
    existing = existing.replace(/\n];\s*$/, `\n${block}\n];\n`);
    writeFileSync(termsPath, existing);
    created.push(`${termsPath} (+term ${id})`);
  }
}

function main(): void {
  const created: string[] = [];
  for (const manifest of listDomainPackManifests()) {
    const domainId = manifest.id;
    const planPath = join(packsRoot, domainId, "rulebook", "rulebook.plan.json");
    if (!existsSync(planPath)) {
      continue;
    }
    const plan = JSON.parse(readFileSync(planPath, "utf8")) as {
      decisions: {
        docType: string;
        kind: string;
        existing: boolean;
        proposedSections: {
          id: string;
          parentTitle: string;
          docTitle: string;
          slots: string[];
        }[];
        termsNeeded: { word: string; abbr: string | null }[];
      }[];
    };

    const rulebookDir = join(packsRoot, domainId, "rulebook");
    writeIfMissing(
      join(rulebookDir, "rules.ts"),
      `import type { Rule } from "@hiveforyou/domain-pack-shared/rulebook/schema";\n\nexport const RULES: Rule[] = [];\n`,
      created,
    );
    writeIfMissing(
      join(rulebookDir, "terms.ts"),
      `import type { Term } from "@hiveforyou/domain-pack-shared/rulebook/schema";\n\nexport const TERMS: Term[] = [];\n`,
      created,
    );
    writeIfMissing(
      join(rulebookDir, "index.ts"),
      `import type { Rulebook } from "@hiveforyou/domain-pack-shared/rulebook/schema";\nimport { RULES } from "./rules.ts";\nimport { TERMS } from "./terms.ts";\n\nexport const rulebook = {\n  domain: "${domainId}",\n  jurisdiction: "US federal",\n  reviewStatus: "draft",\n  version: "0.1.0",\n  rules: RULES,\n  terms: TERMS,\n  guides: [],\n} satisfies Rulebook;\n`,
      created,
    );

    for (const decision of plan.decisions) {
      if (decision.kind === "none" || decision.existing) {
        continue;
      }
      const guideFile = join(rulebookDir, "guides", `${kebabDocType(decision.docType)}.ts`);
      if (existsSync(guideFile)) {
        continue;
      }
      const sections =
        decision.kind === "glossary-only"
          ? "[]"
          : `[${decision.proposedSections
              .map(
                (s) => `{
      id: '${s.id}',
      parentTitle: '${s.parentTitle.replace(/'/g, "\\'")}',
      docTitle: '${s.docTitle.replace(/'/g, "\\'")}',
      rules: [],
      terms: [],
      slots: [${s.slots.map((slot) => `'${slot}'`).join(", ")}],
      required: true,
      emptyState: { notFound: 'TODO(review)', notCaptured: 'TODO(review)' },
      questions: [],
    }`,
              )
              .join(",\n    ")}]`;
      const content = `import type { DocumentGuide } from "@hiveforyou/domain-pack-shared/rulebook/schema";

export const GUIDE: DocumentGuide = {
  kind: '${decision.kind}',
  reviewStatus: 'draft',
  docType: '${decision.docType.replace(/'/g, "\\'")}',
  pageTitle: 'TODO(review)',
  intro: 'TODO(review)',
  basics: [],
  sections: ${sections},
  dates: [],
  rights: [],
  disclaimer: 'TODO(review)',
};
`;
      writeIfMissing(guideFile, content, created);
      appendTerms(join(rulebookDir, "terms.ts"), decision.termsNeeded, created);
    }
  }

  if (created.length === 0) {
    console.log("No new rulebook files created.");
    return;
  }
  console.log("Created:");
  for (const path of created) {
    console.log(`  ${path}`);
  }
}

main();
