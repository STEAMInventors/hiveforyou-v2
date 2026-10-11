/**
 * JSON stdin → JSON stdout compiler CLI for cross-language callers (experimental).
 */
import { compilePackDrivenReaderPrompt, type CompilePackDrivenReaderPromptInput } from "../src/pack-driven-reader/index.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

const raw = await readStdin();
const input = JSON.parse(raw) as CompilePackDrivenReaderPromptInput;
const result = compilePackDrivenReaderPrompt(input);
process.stdout.write(JSON.stringify(result));
