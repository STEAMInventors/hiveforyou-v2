/** Validate native/runtime deps required for PDF extraction on the worker host. */
export async function runSelfCheck(): Promise<void> {
  const { createCanvas } = await import("@napi-rs/canvas");
  createCanvas(1, 1);
  await import("pdfjs-dist/legacy/build/pdf.mjs");
}

export function isSelfCheckArgv(argv: string[]): boolean {
  return argv.includes("--self-check");
}

export async function runSelfCheckIfRequested(argv: string[]): Promise<boolean> {
  if (!isSelfCheckArgv(argv)) {
    return false;
  }
  await runSelfCheck();
  console.info("[worker] self-check ok");
  return true;
}
