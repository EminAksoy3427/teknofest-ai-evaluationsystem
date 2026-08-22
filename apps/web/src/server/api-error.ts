import type {
  AnalysisRunRepositoryError,
  ConfigurationRepositoryError,
  ContestantFeedbackRepositoryError,
  ReviewerAssignmentRepositoryError,
  ReviewerEvaluationRepositoryError,
  SubmissionParticipantRepositoryError,
  SubmissionRepositoryError,
} from "@teknofest-ai/db";
import type { ApiErrorResponse } from "@teknofest-ai/shared";
import type { Context } from "hono";

import type { AuthRuntimeBindings } from "./auth/auth";

export class ApiApplicationError extends Error {
  readonly response: ApiErrorResponse;
  readonly status: 400 | 404 | 409 | 413 | 415 | 500;

  constructor(response: ApiErrorResponse, status: 400 | 404 | 409 | 413 | 415 | 500) {
    super(response.code);
    this.name = "ApiApplicationError";
    this.response = response;
    this.status = status;
  }
}

export function mapSubmissionRepositoryError(
  error: SubmissionRepositoryError,
): ApiApplicationError {
  if (error.code === "NOT_FOUND") {
    return new ApiApplicationError(
      {
        code: "NOT_FOUND",
        message:
          error.reason === "CATEGORY"
            ? "Seçilen kategori bu yarışmada bulunamadı."
            : "Başvuru bulunamadı.",
      },
      404,
    );
  }

  return new ApiApplicationError(
    { code: "CONFLICT", message: "Bu başvuru kodu yarışma içinde zaten kullanılıyor." },
    409,
  );
}

export function mapAnalysisRunRepositoryError(
  error: AnalysisRunRepositoryError,
): ApiApplicationError {
  if (error.code === "NOT_FOUND") {
    return new ApiApplicationError(
      {
        code: "NOT_FOUND",
        message: error.reason === "SUBMISSION" ? "Başvuru bulunamadı." : "Analiz kaydı bulunamadı.",
      },
      404,
    );
  }

  return new ApiApplicationError(
    {
      code: "CONFLICT",
      message:
        error.reason === "CONCURRENT_RUN"
          ? "Bu başvuru için devam eden bir belge işleme çalışması var."
          : "Yarışma yapılandırması analiz başlatmak için hazır değil.",
    },
    409,
  );
}

export function mapReviewerAssignmentRepositoryError(
  error: ReviewerAssignmentRepositoryError,
): ApiApplicationError {
  if (error.code === "NOT_FOUND") {
    return new ApiApplicationError(
      {
        code: "NOT_FOUND",
        message: error.reason === "SUBMISSION" ? "Başvuru bulunamadı." : "Atama bulunamadı.",
      },
      404,
    );
  }

  const messages = {
    DUPLICATE_ASSIGNMENT: "Bu hakem bu başvuruya zaten atanmış.",
    REVIEWER_MEMBERSHIP: "Seçilen kullanıcı bu yarışmada hakem rolüne sahip değil.",
    SUBMITTED_EVALUATION:
      "Gönderilmiş bir hakem değerlendirmesi bulunduğu için atama kaldırılamaz.",
    ASSIGNMENT: "İşlem mevcut atama durumuyla çakışıyor.",
    SUBMISSION: "İşlem mevcut başvuru durumuyla çakışıyor.",
  } as const;

  return new ApiApplicationError({ code: "CONFLICT", message: messages[error.reason] }, 409);
}

export function mapReviewerEvaluationRepositoryError(
  error: ReviewerEvaluationRepositoryError,
): ApiApplicationError {
  if (error.code === "NOT_FOUND") {
    const messages = {
      ASSIGNMENT: "Atama bulunamadı.",
      ANALYSIS_RUN: "Analiz kaydı bulunamadı.",
      RESOURCE: "Hakem değerlendirmesi okunamadı.",
      RUN_NOT_READY: "Analiz kaydı bulunamadı.",
      STALE_RUN: "Analiz kaydı bulunamadı.",
      SUBMITTED_IMMUTABLE: "Hakem değerlendirmesi bulunamadı.",
      ALREADY_EXISTS: "Hakem değerlendirmesi bulunamadı.",
      CRITERION: "Kriter bulunamadı.",
      SCORE_RANGE: "Kriter bulunamadı.",
      INCOMPLETE: "Hakem değerlendirmesi bulunamadı.",
    } as const;
    return new ApiApplicationError({ code: "NOT_FOUND", message: messages[error.reason] }, 404);
  }

  if (error.code === "VALIDATION") {
    const messages = {
      CRITERION: "Gönderilen kriter bu değerlendirmenin rubrik sürümüne ait değil.",
      SCORE_RANGE: "Hakem puanı 0 ile kriterin azami puanı arasında olmalıdır.",
      INCOMPLETE: "Değerlendirmeyi göndermek için tüm rubrik kriterlerini puanlayın.",
      ASSIGNMENT: "Gönderilen alanları kontrol edin.",
      ANALYSIS_RUN: "Gönderilen alanları kontrol edin.",
      RUN_NOT_READY: "Gönderilen alanları kontrol edin.",
      STALE_RUN: "Gönderilen alanları kontrol edin.",
      SUBMITTED_IMMUTABLE: "Gönderilen alanları kontrol edin.",
      ALREADY_EXISTS: "Gönderilen alanları kontrol edin.",
      RESOURCE: "Gönderilen alanları kontrol edin.",
    } as const;
    return new ApiApplicationError(
      { code: "VALIDATION_ERROR", message: messages[error.reason] },
      400,
    );
  }

  const messages = {
    RUN_NOT_READY: "Bu analiz çalışması tamamlanmadığı için değerlendirme kaydedilemez.",
    STALE_RUN:
      "Bu atama zaten başka bir analiz çalışmasına sabitlenmiş; çalışma alanını yenileyin.",
    SUBMITTED_IMMUTABLE: "Gönderilmiş hakem değerlendirmesi değiştirilemez.",
    ALREADY_EXISTS: "Bu atama için zaten bir hakem değerlendirmesi var.",
    ASSIGNMENT: "İşlem mevcut atama durumuyla çakışıyor.",
    ANALYSIS_RUN: "İşlem mevcut analiz durumuyla çakışıyor.",
    CRITERION: "İşlem mevcut rubrik durumuyla çakışıyor.",
    SCORE_RANGE: "İşlem mevcut rubrik durumuyla çakışıyor.",
    INCOMPLETE: "İşlem mevcut değerlendirme durumuyla çakışıyor.",
    RESOURCE: "İşlem mevcut değerlendirme durumuyla çakışıyor.",
  } as const;

  return new ApiApplicationError({ code: "CONFLICT", message: messages[error.reason] }, 409);
}

export function mapSubmissionParticipantRepositoryError(
  error: SubmissionParticipantRepositoryError,
): ApiApplicationError {
  if (error.code === "NOT_FOUND") {
    return new ApiApplicationError(
      {
        code: "NOT_FOUND",
        message: error.reason === "SUBMISSION" ? "Başvuru bulunamadı." : "Katılımcı bulunamadı.",
      },
      404,
    );
  }

  const messages = {
    DUPLICATE_PARTICIPANT: "Bu kullanıcı bu başvuruya zaten eklenmiş.",
    CONTESTANT_MEMBERSHIP: "Seçilen kullanıcı bu yarışmada yarışmacı rolüne sahip değil.",
    SUBMISSION: "İşlem mevcut başvuru durumuyla çakışıyor.",
    PARTICIPANT: "İşlem mevcut katılımcı durumuyla çakışıyor.",
  } as const;

  return new ApiApplicationError({ code: "CONFLICT", message: messages[error.reason] }, 409);
}

export function mapContestantFeedbackRepositoryError(
  error: ContestantFeedbackRepositoryError,
): ApiApplicationError {
  if (error.code === "NOT_FOUND") {
    const messages = {
      SUBMISSION: "Bu başvuru için henüz bir geri bildirim taslağı yok.",
      EVALUATION: "Kaynak hakem değerlendirmesi bulunamadı.",
      STALE_SOURCE: "Geri bildirim bulunamadı.",
      PUBLISHED_IMMUTABLE: "Geri bildirim bulunamadı.",
      INCOMPLETE: "Geri bildirim bulunamadı.",
      RESOURCE: "Geri bildirim bulunamadı.",
    } as const;
    return new ApiApplicationError({ code: "NOT_FOUND", message: messages[error.reason] }, 404);
  }

  if (error.code === "VALIDATION") {
    return new ApiApplicationError(
      {
        code: "VALIDATION_ERROR",
        message:
          "Yayımlamak için özet, güçlü yönler, gelişim alanları ve öneriler bölümlerinin her biri doldurulmalıdır.",
      },
      400,
    );
  }

  const messages = {
    STALE_SOURCE: "Bu geri bildirim taslağı zaten başka bir hakem değerlendirmesine sabitlenmiş.",
    PUBLISHED_IMMUTABLE: "Yayımlanmış geri bildirim değiştirilemez.",
    SUBMISSION: "İşlem mevcut başvuru durumuyla çakışıyor.",
    EVALUATION: "İşlem mevcut değerlendirme durumuyla çakışıyor.",
    INCOMPLETE: "İşlem mevcut geri bildirim durumuyla çakışıyor.",
    RESOURCE: "İşlem mevcut geri bildirim durumuyla çakışıyor.",
  } as const;

  return new ApiApplicationError({ code: "CONFLICT", message: messages[error.reason] }, 409);
}

interface RuntimeSchema<T> {
  safeParse(value: unknown):
    | { success: true; data: T }
    | {
        success: false;
        error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] };
      };
}

export async function parseJsonBody<T>(
  context: Context<{ Bindings: AuthRuntimeBindings }>,
  schema: RuntimeSchema<T>,
) {
  let payload: unknown;
  try {
    payload = await context.req.json();
  } catch {
    throw new ApiApplicationError(
      { code: "VALIDATION_ERROR", message: "İstek gövdesi geçerli JSON olmalıdır." },
      400,
    );
  }

  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new ApiApplicationError(
      {
        code: "VALIDATION_ERROR",
        message: "Gönderilen alanları kontrol edin.",
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      400,
    );
  }

  return result.data;
}

export function mapRepositoryError(error: ConfigurationRepositoryError): ApiApplicationError {
  if (error.code === "NOT_FOUND") {
    return new ApiApplicationError(
      { code: "NOT_FOUND", message: "İstenen yapılandırma kaynağı bulunamadı." },
      404,
    );
  }

  const messages = {
    CATEGORY_CODE: "Bu kategori kodu yarışma içinde zaten kullanılıyor.",
    CATEGORY_IN_USE: "Bu kategoriye bağlı başvurular bulunduğu için silinemez.",
    COMPETITION_SLUG: "Bu yarışma slug değeri zaten kullanılıyor.",
    IMMUTABLE_VERSION: "Aktif veya emekli sürümler değiştirilemez.",
    RUBRIC_NOT_READY: "Kriteri olmayan bir rubrik etkinleştirilemez.",
    TEMPLATE_NOT_READY: "Şablon için en az bir bölüm ve bir zorunlu bölüm tanımlayın.",
    TEMPLATE_FILE_MISSING: "Resmî rapor şablonu PDF'i yüklenmeden şablon etkinleştirilemez.",
    VERSION_NUMBER: "Sürüm oluşturulurken eşzamanlı bir değişiklik oluştu; tekrar deneyin.",
    RESOURCE: "İşlem mevcut yapılandırma durumuyla çakışıyor.",
  } as const;

  return new ApiApplicationError({ code: "CONFLICT", message: messages[error.reason] }, 409);
}
