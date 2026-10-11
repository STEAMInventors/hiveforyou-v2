from pathlib import Path
path = Path(r"c:/Users/abhattacharyya/hiveforyou-v2/experiments/t3-9-ontology/src/run-mode.ts")
raw = path.read_bytes()
text = raw[2:].decode("utf-16le") if raw[:2] == b"\xff\xfe" else raw.decode("utf-8")
if "writeModelResponseArtifact" not in text:
    text = text.replace(
        'import { parseExtractionResponse } from "./parse-proposals.js";',
        'import { writeModelResponseArtifact } from "./model-response-artifact.js";\nimport { parseExtractionResponse } from "./parse-proposals.js";',
    )
if "resultsDir: string" not in text:
    text = text.replace(
        "  userPrompt: string;\n  meta: Omit<CallTrace",
        "  userPrompt: string;\n  resultsDir: string;\n  meta: Omit<CallTrace",
    )
if "writeModelResponseArtifact({" not in text:
    text = text.replace(
        "  );\n  const usage = parseModelUsage(response.usage);\n  const parsed = parseExtractionResponse(response.outputText, input.catalog);",
        "  );\n  writeModelResponseArtifact({\n    resultsDir: input.resultsDir,\n    callId: input.meta.callId,\n    outputText: response.outputText,\n  });\n  const usage = parseModelUsage(response.usage);\n  const parsed = parseExtractionResponse(response.outputText, input.catalog);",
    )
for old, new in [
    ("          userPrompt,\n          meta:", "          userPrompt,\n          resultsDir: input.resultsDir,\n          meta:"),
    ("      userPrompt,\n      meta:", "      userPrompt,\n      resultsDir: input.resultsDir,\n      meta:"),
    ("    userPrompt: relationshipPrompt,\n    meta:", "    userPrompt: relationshipPrompt,\n    resultsDir: input.resultsDir,\n    meta:"),
]:
    if old in text and new not in text:
        text = text.replace(old, new)
path.write_text(text, encoding="utf-8", newline="\n")
print("done")
