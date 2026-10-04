import type { OcrEngine } from "@hiveforyou/intake/nestiep-ocr-engine";

type BoundingBox = { x: number; y: number; width: number; height: number };

interface GutenTextLine {
  readonly text: string;
  readonly frame?: { top: number; left: number; width: number; height: number };
}

interface GutenOcrInstance {
  detect(
    image: string | { data: Uint8Array; width: number; height: number },
  ): Promise<GutenTextLine[] | { texts: GutenTextLine[] }>;
}

interface GutenOcrModule {
  default: {
    create: (options?: {
      models?: {
        detectionPath?: string;
        recognitionPath?: string;
        dictionaryPath?: string;
      };
    }) => Promise<GutenOcrInstance>;
  };
}

function frameToBox(frame: GutenTextLine["frame"]): BoundingBox | undefined {
  if (frame === undefined) {
    return undefined;
  }
  return { x: frame.left, y: frame.top, width: frame.width, height: frame.height };
}

/** Optional NestIEP PaddleOCR adapter via dynamic ONNX models path. */
export async function createGutenOcrEngine(modelDir?: string): Promise<OcrEngine> {
  let loaded: GutenOcrModule;
  try {
    loaded = (await import("@gutenye/ocr-node")) as GutenOcrModule;
  } catch (error) {
    throw new Error("Guten PaddleOCR adapter is not available.", { cause: error });
  }

  const options =
    modelDir === undefined
      ? {}
      : {
          models: {
            detectionPath: `${modelDir}/det.onnx`,
            recognitionPath: `${modelDir}/rec.onnx`,
            dictionaryPath: `${modelDir}/ppocr_keys_v1.txt`,
          },
        };

  const instance = await loaded.default.create(options);

  return {
    adapterId: "guten-paddleocr-onnx",
    async recognizePage(image, _context) {
      const raw = await instance.detect({
        data: image.bytes,
        width: image.width,
        height: image.height,
      });
      const texts = Array.isArray(raw) ? raw : raw.texts;
      return {
        lines: texts.map((line) => {
          const boundingBox = frameToBox(line.frame);
          return boundingBox === undefined
            ? { text: line.text }
            : { text: line.text, boundingBox };
        }),
      };
    },
  };
}
