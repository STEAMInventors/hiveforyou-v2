/**
 * JSON stdin → JSON stdout bridge for Python hive-agents (compile + parse).
 * Build: `pnpm --filter @hiveforyou/domain-pack run build:pack-driven-bridge`
 */
import {
  compilePackDrivenReaderPrompt,
  type CompilePackDrivenReaderPromptInput,
} from "../src/pack-driven-reader/index.js";
import { parseAndValidatePackDrivenExtraction } from "../src/pack-driven-reader/parse-extraction.js";
import type { ProposalDomainPack } from "../src/pack-driven-reader/types.js";

type BridgeRequest =
  | ({ op: "compile" } & CompilePackDrivenReaderPromptInput)
  | {
      op: "parse";
      pack: ProposalDomainPack;
      raw: unknown;
      expectedSourceDocumentId: string;
    };

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

const raw = await readStdin();
const input = JSON.parse(raw) as BridgeRequest;

if (input.op === "compile") {
  const { op: _op, ...compileInput } = input;
  const result = compilePackDrivenReaderPrompt(compileInput);
  process.stdout.write(JSON.stringify(result));
} else if (input.op === "parse") {
  const result = parseAndValidatePackDrivenExtraction({
    pack: input.pack,
    raw: input.raw,
    expectedSourceDocumentId: input.expectedSourceDocumentId,
  });
  process.stdout.write(JSON.stringify(result));
} else {
  process.stderr.write("unknown op");
  process.exit(1);
}
