import { compilePackDrivenReaderPrompt } from "./compile-prompt.js";
import { summarizeOutputSchemaStructure } from "./output-schema.js";
import type {
  CompilePackDrivenReaderPromptInput,
  ProposalDomainPack,
} from "./types.js";

export type PackDrivenReaderPreviewDocumentSpec = {
  documentTypeId: string;
  sourceDocumentId: string;
  samplePages: Array<{ pageNumber: number; text: string }>;
};

export function renderPackDrivenReaderPreviewReport(input: {
  pack: ProposalDomainPack;
  caseManifest: CompilePackDrivenReaderPromptInput["caseManifest"];
  documents: PackDrivenReaderPreviewDocumentSpec[];
}): string {
  const sections: string[] = [
    "# Pack-driven Reader prompt preview (offline)",
    "",
    `packId: ${input.pack.manifest.id}`,
    `packVersion: ${input.pack.manifest.version}`,
    "",
  ];

  for (const doc of input.documents) {
    const compiled = compilePackDrivenReaderPrompt({
      pack: input.pack,
      documentTypeId: doc.documentTypeId,
      caseManifest: input.caseManifest,
      document: {
        sourceDocumentId: doc.sourceDocumentId,
        pages: doc.samplePages,
      },
      emitCacheBoundaryHints: true,
    });
    const schemaSummary = summarizeOutputSchemaStructure(compiled.outputJsonSchema);
    sections.push(`## ${doc.documentTypeId}`);
    sections.push("");
    sections.push(`- selectedRecordTypes (${compiled.selectedRecordTypeIds.length}): ${compiled.selectedRecordTypeIds.join(", ")}`);
    sections.push(`- selectedFieldCount: ${compiled.selectedFieldCount}`);
    sections.push(`- packContentSha256: ${compiled.packContentSha256}`);
    sections.push(`- promptVersion: ${compiled.promptVersion}`);
    sections.push(`- outputSchema.topLevelRequired: ${schemaSummary.topLevelRequired.join(", ")}`);
    sections.push(`- outputSchema.recordTypeIds: ${schemaSummary.recordTypeIds.join(", ")}`);
    sections.push("");
    sections.push("### Block A (universal excerpt)");
    sections.push(compiled.blocks.A_universal.slice(0, 400) + "…");
    sections.push("");
    sections.push("### Block B (pack definition excerpt)");
    sections.push(compiled.blocks.B_packDefinitionAndContract.slice(0, 600) + "…");
    sections.push("");
    sections.push("### Block D (checklist catalog excerpt)");
    sections.push(compiled.blocks.D_documentTypeChecklist.slice(0, 800) + "…");
    sections.push("");
    sections.push("### Full stable system prefix length");
    sections.push(String(compiled.stableSystemPrefix.length));
    sections.push("");
    sections.push("### Full case user content length");
    sections.push(String(compiled.caseUserContent.length));
    sections.push("");
    sections.push("---");
    sections.push("");
  }

  return sections.join("\n");
}
