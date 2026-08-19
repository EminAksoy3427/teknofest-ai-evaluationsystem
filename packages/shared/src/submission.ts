import { z } from "zod";

export const MAX_SUBMISSION_PDF_BYTES = 20 * 1024 * 1024;

const requiredText = (field: string, maximum: number) =>
  z.string().trim().min(1, `${field} boş bırakılamaz.`).max(maximum, `${field} çok uzun.`);

export const SubmissionCreateMetadataSchema = z
  .object({
    applicationCode: requiredText("Başvuru kodu", 80),
    projectTitle: requiredText("Proje başlığı", 240),
    categoryId: z.string().trim().min(1, "Kategori seçilmelidir.").max(160),
  })
  .strict();

export type SubmissionCreateMetadata = z.infer<typeof SubmissionCreateMetadataSchema>;

export const SubmissionCategorySummarySchema = z
  .object({
    id: z.string().min(1),
    code: z.string().min(1),
    name: z.string().min(1),
  })
  .strict();

export const SubmissionFileMetadataSchema = z
  .object({
    id: z.string().min(1),
    originalFilename: z.string().min(1),
    mimeType: z.literal("application/pdf"),
    sizeBytes: z.number().int().positive().max(MAX_SUBMISSION_PDF_BYTES),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    createdAt: z.number().int().nonnegative(),
  })
  .strict();

export type SubmissionFileMetadata = z.infer<typeof SubmissionFileMetadataSchema>;

export const ExactDuplicateSignalSchema = z
  .object({
    exactDuplicate: z.boolean(),
    matchingSubmissionCount: z.number().int().nonnegative(),
  })
  .strict();

export type ExactDuplicateSignal = z.infer<typeof ExactDuplicateSignalSchema>;

export const SubmissionSummarySchema = z
  .object({
    id: z.string().min(1),
    competitionId: z.string().min(1),
    applicationCode: z.string().min(1),
    projectTitle: z.string().min(1),
    category: SubmissionCategorySummarySchema,
    file: SubmissionFileMetadataSchema,
    exactDuplicate: z.boolean(),
    matchingSubmissionCount: z.number().int().nonnegative(),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();

export type SubmissionSummary = z.infer<typeof SubmissionSummarySchema>;

export const SubmissionResponseSchema = SubmissionSummarySchema;
export type SubmissionResponse = z.infer<typeof SubmissionResponseSchema>;

export const SubmissionListResponseSchema = z
  .object({ submissions: z.array(SubmissionSummarySchema) })
  .strict();

export type SubmissionListResponse = z.infer<typeof SubmissionListResponseSchema>;
