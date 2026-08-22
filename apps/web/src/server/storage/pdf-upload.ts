import { ApiApplicationError } from "../api-error";

/**
 * Shared PDF-upload validation primitives.
 *
 * Extracted out of the submission upload route so the official-template upload route can reuse the
 * exact same signature/size/hash discipline instead of re-implementing it: both are a single
 * `application/pdf` body validated by MIME + real `%PDF-` signature + a server-computed SHA-256,
 * streamed with a hard byte cap so neither route ever buffers past its own declared limit.
 */

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];

export function hasPdfSignature(bytes: Uint8Array): boolean {
  return PDF_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digestInput = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  digestInput.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", digestInput.buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Reads a request body up to `maxBytes`, aborting the stream the moment the cap is exceeded rather
 * than buffering the full (potentially much larger) declared or actual body first. A malformed
 * `Content-Length` header is rejected outright; a well-formed one that already exceeds the cap short
 * -circuits before a single byte is read.
 */
export async function readBoundedBody(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const contentLength = Number(declaredLength);
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      throw new ApiApplicationError(
        { code: "VALIDATION_ERROR", message: "Content-Length başlığı geçersizdir." },
        400,
      );
    }
    if (contentLength > maxBytes) {
      throw new ApiApplicationError(
        { code: "PAYLOAD_TOO_LARGE", message: "Dosya boyutu izin verilen sınırı aşıyor." },
        413,
      );
    }
  }

  if (!request.body) {
    throw new ApiApplicationError(
      { code: "VALIDATION_ERROR", message: "İstek gövdesi gereklidir." },
      400,
    );
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    totalBytes += chunk.value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new ApiApplicationError(
        { code: "PAYLOAD_TOO_LARGE", message: "Dosya boyutu izin verilen sınırı aşıyor." },
        413,
      );
    }
    chunks.push(chunk.value);
  }

  const body = new Uint8Array(new ArrayBuffer(totalBytes));
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export interface ValidatedPdf {
  bytes: Uint8Array;
  sha256: string;
}

/**
 * Validates an already-read byte array as a genuine, non-empty, within-limit PDF and computes its
 * server-side content hash. The declared/reported MIME type and the original filename are never
 * trusted as proof of content — only the real `%PDF-` signature is.
 */
export async function validatePdfBytes(bytes: Uint8Array, maxBytes: number): Promise<ValidatedPdf> {
  if (bytes.byteLength === 0) {
    throw new ApiApplicationError(
      { code: "VALIDATION_ERROR", message: "PDF dosyası boş olamaz." },
      400,
    );
  }
  if (bytes.byteLength > maxBytes) {
    throw new ApiApplicationError(
      { code: "PAYLOAD_TOO_LARGE", message: "Dosya boyutu izin verilen sınırı aşıyor." },
      413,
    );
  }
  if (!hasPdfSignature(bytes)) {
    throw new ApiApplicationError(
      { code: "VALIDATION_ERROR", message: "Dosya geçerli bir PDF imzasıyla başlamalıdır." },
      400,
    );
  }
  return { bytes, sha256: await sha256Hex(bytes) };
}
