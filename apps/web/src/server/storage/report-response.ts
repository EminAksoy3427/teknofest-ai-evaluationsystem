import { ApiApplicationError } from "../api-error";
import type { AuthRuntimeBindings } from "../auth/auth";
import type { DocumentStorage } from "./documents";

export function normalizeDisplayFilename(value: string): string {
  const basename = value.replaceAll("\\", "/").split("/").at(-1) ?? "";
  const normalized = [...basename]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint >= 32 && !(codePoint >= 127 && codePoint <= 159);
    })
    .slice(0, 180)
    .join("")
    .trim();
  return normalized === "" || normalized === "." || normalized === ".." ? "rapor.pdf" : normalized;
}

export function contentDisposition(filename: string): string {
  const safeFilename = normalizeDisplayFilename(filename);
  const ascii =
    safeFilename
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9._ -]/g, "_")
      .replace(/["\\]/g, "_")
      .slice(0, 120) || "rapor.pdf";
  const encoded = encodeURIComponent(safeFilename).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `inline; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * Streams a submission report out of the private `DOCUMENTS` bucket. The R2 object key is resolved
 * from server-held metadata and never returned to the browser, and the response is marked
 * `private, no-store` so no shareable or cacheable URL for the report body is ever produced. Every
 * caller must have completed its own competition-scoped authorization before reaching this helper.
 */
export async function reportResponse(
  environment: AuthRuntimeBindings,
  documentStorage: DocumentStorage,
  metadata: { id: string; storageKey: string; originalFilename: string },
  competitionId: string,
  submissionId: string,
): Promise<Response> {
  let object: R2ObjectBody | null;
  try {
    object = await documentStorage.getSubmissionReport(environment.DOCUMENTS, metadata.storageKey);
  } catch {
    object = null;
  }
  if (!object) {
    console.error("submission report object missing", {
      competitionId,
      submissionId,
      fileId: metadata.id,
    });
    throw new ApiApplicationError(
      { code: "STORAGE_ERROR", message: "Başvuru raporu belge deposundan okunamadı." },
      500,
    );
  }

  return new Response(object.body, {
    headers: new Headers({
      "cache-control": "private, no-store",
      "content-disposition": contentDisposition(metadata.originalFilename),
      "content-length": String(object.size),
      "content-type": "application/pdf",
      etag: object.httpEtag,
    }),
  });
}
