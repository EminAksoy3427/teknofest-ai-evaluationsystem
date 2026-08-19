import {
  type AnalysisErrorCode,
  type DocumentExtractionArtifact,
  DocumentExtractionArtifactSchema,
  MAX_DOCUMENT_CHARACTERS,
  MAX_DOCUMENT_PAGES,
  MIN_USABLE_DOCUMENT_CHARACTERS,
} from "@teknofest-ai/shared";
import { getDocumentProxy } from "unpdf";

export class DocumentProcessingError extends Error {
  readonly code: AnalysisErrorCode;
  readonly safeMessage: string;

  constructor(code: AnalysisErrorCode, safeMessage: string) {
    super(code);
    this.name = "DocumentProcessingError";
    this.code = code;
    this.safeMessage = safeMessage;
  }
}

function normalizeExtractedText(value: string): string {
  const withoutControlNoise: string[] = [];
  for (const character of value.replace(/\r\n?/g, "\n")) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint === 9 ||
      codePoint === 10 ||
      (codePoint >= 32 && !(codePoint >= 127 && codePoint <= 159))
    ) {
      withoutControlNoise.push(character);
    }
  }
  return withoutControlNoise
    .join("")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parserFailure(error: unknown): DocumentProcessingError {
  const name = error instanceof Error ? error.name.toLowerCase() : "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (name.includes("password") || message.includes("password")) {
    return new DocumentProcessingError("PDF_ENCRYPTED", "Parola korumalı PDF metni çıkarılamadı.");
  }
  if (name.includes("unsupported") || message.includes("unsupported feature")) {
    return new DocumentProcessingError(
      "PDF_UNSUPPORTED",
      "PDF bu çıkarım sürümü tarafından desteklenmiyor.",
    );
  }
  return new DocumentProcessingError("PDF_PARSE_FAILED", "PDF metni güvenli biçimde çıkarılamadı.");
}

export interface ExtractDocumentInput {
  bytes: Uint8Array;
  submissionId: string;
  analysisRunId: string;
  sourceSha256: string;
}

export async function extractDocument(
  input: ExtractDocumentInput,
): Promise<DocumentExtractionArtifact> {
  let document: Awaited<ReturnType<typeof getDocumentProxy>> | null = null;
  try {
    document = await getDocumentProxy(input.bytes, {
      enableXfa: false,
      isImageDecoderSupported: false,
      isOffscreenCanvasSupported: false,
      useSystemFonts: false,
      useWasm: false,
      verbosity: 0,
    });
    if (document.numPages < 1 || document.numPages > MAX_DOCUMENT_PAGES) {
      throw new DocumentProcessingError(
        "DOCUMENT_TOO_COMPLEX",
        `Belge en fazla ${MAX_DOCUMENT_PAGES} sayfa işlenebilir.`,
      );
    }

    const pages: DocumentExtractionArtifact["pages"] = [];
    let characterCount = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      let rawText = "";
      try {
        const content = await page.getTextContent();
        for (const item of content.items) {
          if (!("str" in item) || typeof item.str !== "string") continue;
          rawText += item.str;
          if (item.hasEOL) rawText += "\n";
        }
      } finally {
        page.cleanup();
      }

      const text = normalizeExtractedText(rawText);
      characterCount += text.length;
      if (characterCount > MAX_DOCUMENT_CHARACTERS) {
        throw new DocumentProcessingError(
          "DOCUMENT_TOO_COMPLEX",
          `Belgeden en fazla ${MAX_DOCUMENT_CHARACTERS} karakter çıkarılabilir.`,
        );
      }
      pages.push({ pageNumber, text, characterCount: text.length });
    }

    return DocumentExtractionArtifactSchema.parse({
      schemaVersion: "document-extraction/v1",
      submissionId: input.submissionId,
      analysisRunId: input.analysisRunId,
      sourceSha256: input.sourceSha256,
      pageCount: pages.length,
      characterCount,
      pages,
      warnings: characterCount < MIN_USABLE_DOCUMENT_CHARACTERS ? ["TEXT_SPARSE"] : [],
    });
  } catch (error) {
    if (error instanceof DocumentProcessingError) throw error;
    throw parserFailure(error);
  } finally {
    if (document) {
      await document.loadingTask.destroy();
    }
  }
}
