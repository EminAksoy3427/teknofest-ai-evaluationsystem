import { z } from "zod";

import { VersionStatusSchema } from "./status";
import { MAX_SUBMISSION_PDF_BYTES } from "./submission";

/**
 * The official report-template PDF reuses the same 20 MiB ceiling as a submission report: both are
 * a single application/pdf body validated by the same signature/size/hash discipline, so a second,
 * differently-tuned limit would be an arbitrary distinction rather than a real product difference.
 */
export const MAX_TEMPLATE_PDF_BYTES = MAX_SUBMISSION_PDF_BYTES;

const trimmedText = (field: string, maximum: number) =>
  z.string().trim().min(1, `${field} boş bırakılamaz.`).max(maximum, `${field} çok uzun.`);

export const SlugSchema = z
  .string()
  .min(2, "Slug en az 2 karakter olmalıdır.")
  .max(80, "Slug en fazla 80 karakter olabilir.")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug yalnızca küçük harf, rakam ve tek tire ayırıcıları içerebilir.",
  );

export const StableKeySchema = z
  .string()
  .min(1, "Kod boş bırakılamaz.")
  .max(80, "Kod en fazla 80 karakter olabilir.")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Kod yalnızca küçük harf, rakam ve tek tire ayırıcıları içerebilir.",
  );

export const ExpectedLanguageSchema = z
  .string()
  .min(2)
  .max(35)
  .regex(
    /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/,
    "Dil kodu tr veya en-US benzeri normalize bir tanımlayıcı olmalıdır.",
  );

export const CompetitionCreateRequestSchema = z
  .object({
    name: trimmedText("Yarışma adı", 160),
    slug: SlugSchema,
    description: z
      .string()
      .trim()
      .max(2_000, "Açıklama en fazla 2000 karakter olabilir.")
      .default(""),
  })
  .strict();

export type CompetitionCreateRequest = z.infer<typeof CompetitionCreateRequestSchema>;

export const CompetitionUpdateRequestSchema = z
  .object({
    name: trimmedText("Yarışma adı", 160).optional(),
    slug: SlugSchema.optional(),
    description: z
      .string()
      .trim()
      .max(2_000, "Açıklama en fazla 2000 karakter olabilir.")
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "En az bir alan gönderilmelidir.");

export type CompetitionUpdateRequest = z.infer<typeof CompetitionUpdateRequestSchema>;

export const CompetitionResponseSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    slug: SlugSchema,
    description: z.string(),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();

export type CompetitionResponse = z.infer<typeof CompetitionResponseSchema>;

export const CategoryCreateRequestSchema = z
  .object({
    name: trimmedText("Kategori adı", 120),
    code: StableKeySchema,
    description: trimmedText("Kategori açıklaması", 2_000),
    guidance: z
      .string()
      .trim()
      .max(2_000, "Kapsam notu en fazla 2000 karakter olabilir.")
      .default(""),
    order: z.number().int().min(0).max(10_000).default(0),
  })
  .strict();

export type CategoryCreateRequest = z.infer<typeof CategoryCreateRequestSchema>;

export const CategoryUpdateRequestSchema = CategoryCreateRequestSchema.partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "En az bir alan gönderilmelidir.");

export type CategoryUpdateRequest = z.infer<typeof CategoryUpdateRequestSchema>;

export const CategoryResponseSchema = CategoryCreateRequestSchema.extend({
  id: z.string().min(1),
  competitionId: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
}).strict();

export type CategoryResponse = z.infer<typeof CategoryResponseSchema>;

export const CategoryListResponseSchema = z
  .object({ categories: z.array(CategoryResponseSchema) })
  .strict();
export type CategoryListResponse = z.infer<typeof CategoryListResponseSchema>;

export const TemplateSectionRuleSchema = z
  .object({
    key: StableKeySchema,
    title: trimmedText("Bölüm başlığı", 160),
    description: z.string().trim().max(1_000, "Bölüm açıklaması en fazla 1000 karakter olabilir."),
    required: z.boolean(),
    order: z.number().int().positive().max(1_000),
  })
  .strict();

export type TemplateSectionRule = z.infer<typeof TemplateSectionRuleSchema>;

export const TemplateStructuralProfileSchema = z
  .object({
    expectedLanguage: ExpectedLanguageSchema,
    sections: z.array(TemplateSectionRuleSchema).max(100),
  })
  .strict()
  .superRefine((profile, context) => {
    const keys = new Set<string>();
    const orders = new Set<number>();

    profile.sections.forEach((section, index) => {
      if (keys.has(section.key)) {
        context.addIssue({
          code: "custom",
          message: "Bölüm kodları şablon içinde benzersiz olmalıdır.",
          path: ["sections", index, "key"],
        });
      }
      if (orders.has(section.order) || section.order !== index + 1) {
        context.addIssue({
          code: "custom",
          message: "Bölüm sırası 1'den başlayan kesintisiz bir sıra olmalıdır.",
          path: ["sections", index, "order"],
        });
      }
      keys.add(section.key);
      orders.add(section.order);
    });
  });

export type TemplateStructuralProfile = z.infer<typeof TemplateStructuralProfileSchema>;

export const TemplateVersionCreateRequestSchema = z
  .object({
    label: trimmedText("Şablon sürüm etiketi", 120),
    structuralProfile: TemplateStructuralProfileSchema,
  })
  .strict();

export type TemplateVersionCreateRequest = z.infer<typeof TemplateVersionCreateRequestSchema>;

export const TemplateVersionUpdateRequestSchema = TemplateVersionCreateRequestSchema.partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "En az bir alan gönderilmelidir.");

export type TemplateVersionUpdateRequest = z.infer<typeof TemplateVersionUpdateRequestSchema>;

/**
 * Metadata for the official report-template PDF attached to a TemplateVersion. The R2 object key is
 * never part of this shape: it stays a server-internal identifier and is never returned to a
 * client, exactly like `SubmissionFileMetadata`.
 */
export const TemplateFileMetadataSchema = z
  .object({
    originalFilename: z.string().min(1).max(200),
    mimeType: z.literal("application/pdf"),
    sizeBytes: z.number().int().positive().max(MAX_TEMPLATE_PDF_BYTES),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    createdAt: z.number().int().nonnegative(),
  })
  .strict();
export type TemplateFileMetadata = z.infer<typeof TemplateFileMetadataSchema>;

/**
 * A TemplateVersion represents BOTH the official versioned template file and the structural profile
 * used by analysis. `file` is null only while the version is still a DRAFT with no upload yet; a
 * version can never become ACTIVE without one, so every ACTIVE or RETIRED response has a non-null
 * `file`.
 */
export const TemplateVersionResponseSchema = z
  .object({
    id: z.string().min(1),
    competitionId: z.string().min(1),
    versionNumber: z.number().int().positive(),
    label: z.string().min(1),
    status: VersionStatusSchema,
    structuralProfile: TemplateStructuralProfileSchema,
    file: TemplateFileMetadataSchema.nullable(),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();

export type TemplateVersionResponse = z.infer<typeof TemplateVersionResponseSchema>;

export const TemplateVersionListResponseSchema = z
  .object({ templates: z.array(TemplateVersionResponseSchema) })
  .strict();
export type TemplateVersionListResponse = z.infer<typeof TemplateVersionListResponseSchema>;

export const RubricVersionCreateRequestSchema = z
  .object({ label: trimmedText("Rubrik sürüm etiketi", 120) })
  .strict();
export type RubricVersionCreateRequest = z.infer<typeof RubricVersionCreateRequestSchema>;

export const RubricVersionUpdateRequestSchema = RubricVersionCreateRequestSchema.partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "En az bir alan gönderilmelidir.");
export type RubricVersionUpdateRequest = z.infer<typeof RubricVersionUpdateRequestSchema>;

export const CriterionInputSchema = z
  .object({
    code: StableKeySchema,
    name: trimmedText("Kriter adı", 160),
    description: trimmedText("Kriter açıklaması", 2_000),
    maxScore: z.number().int().positive().max(1_000),
    weight: z
      .number()
      .finite()
      .min(0)
      .max(100)
      .refine((value) => Number.isInteger(value * 100), {
        message: "Ağırlık en fazla iki ondalık basamak içerebilir.",
      }),
    evidenceExpectation: trimmedText("Kanıt beklentisi", 2_000),
    order: z.number().int().positive().max(1_000),
  })
  .strict();

export type CriterionInput = z.infer<typeof CriterionInputSchema>;

export const CriteriaReplaceRequestSchema = z
  .object({ criteria: z.array(CriterionInputSchema).max(100) })
  .strict()
  .superRefine(({ criteria }, context) => {
    const codes = new Set<string>();
    criteria.forEach((criterion, index) => {
      if (codes.has(criterion.code)) {
        context.addIssue({
          code: "custom",
          message: "Kriter kodları rubrik içinde benzersiz olmalıdır.",
          path: ["criteria", index, "code"],
        });
      }
      if (criterion.order !== index + 1) {
        context.addIssue({
          code: "custom",
          message: "Kriter sırası 1'den başlayan kesintisiz bir sıra olmalıdır.",
          path: ["criteria", index, "order"],
        });
      }
      codes.add(criterion.code);
    });
  });

export type CriteriaReplaceRequest = z.infer<typeof CriteriaReplaceRequestSchema>;

export const CriterionResponseSchema = CriterionInputSchema.extend({
  id: z.string().min(1),
  rubricVersionId: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
}).strict();
export type CriterionResponse = z.infer<typeof CriterionResponseSchema>;

export const RubricVersionResponseSchema = z
  .object({
    id: z.string().min(1),
    competitionId: z.string().min(1),
    versionNumber: z.number().int().positive(),
    label: z.string().min(1),
    status: VersionStatusSchema,
    criteria: z.array(CriterionResponseSchema),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();
export type RubricVersionResponse = z.infer<typeof RubricVersionResponseSchema>;

export const RubricVersionListResponseSchema = z
  .object({ rubrics: z.array(RubricVersionResponseSchema) })
  .strict();
export type RubricVersionListResponse = z.infer<typeof RubricVersionListResponseSchema>;

export const CompetitionConfigurationReadinessSchema = z
  .object({
    competition: z.boolean(),
    categories: z.boolean(),
    activeTemplate: z.boolean(),
    /**
     * Reported separately from `activeTemplate` because a pre-P6.5A competition can legitimately
     * still carry an ACTIVE TemplateVersion with no official file. That historical row is preserved
     * as-is, but it is not valid configuration for NEW work, so the two facts are surfaced
     * truthfully rather than collapsed into one misleading "no active template" signal.
     */
    activeTemplateFile: z.boolean(),
    activeRubric: z.boolean(),
    rubricHasCriteria: z.boolean(),
    ready: z.boolean(),
  })
  .strict();
export type CompetitionConfigurationReadiness = z.infer<
  typeof CompetitionConfigurationReadinessSchema
>;

export const CompetitionConfigurationResponseSchema = z
  .object({
    competition: CompetitionResponseSchema,
    categories: z.array(CategoryResponseSchema),
    templates: z.array(TemplateVersionResponseSchema),
    rubrics: z.array(RubricVersionResponseSchema),
    readiness: CompetitionConfigurationReadinessSchema,
  })
  .strict();
export type CompetitionConfigurationResponse = z.infer<
  typeof CompetitionConfigurationResponseSchema
>;

export const ApiErrorResponseSchema = z
  .object({
    code: z.enum([
      "UNAUTHORIZED",
      "FORBIDDEN",
      "NOT_FOUND",
      "VALIDATION_ERROR",
      "CONFLICT",
      "PAYLOAD_TOO_LARGE",
      "UNSUPPORTED_MEDIA_TYPE",
      "STORAGE_ERROR",
      "INTERNAL_ERROR",
    ]),
    message: z.string().min(1),
    issues: z.array(z.object({ path: z.string(), message: z.string() }).strict()).optional(),
  })
  .strict();
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

export function isTemplateProfileActivatable(profile: TemplateStructuralProfile): boolean {
  return profile.sections.length > 0 && profile.sections.some((section) => section.required);
}

export function deriveConfigurationReadiness(
  configuration: Pick<
    CompetitionConfigurationResponse,
    "competition" | "categories" | "templates" | "rubrics"
  >,
): CompetitionConfigurationReadiness {
  const activeTemplate = configuration.templates.find((version) => version.status === "ACTIVE");
  const activeRubric = configuration.rubrics.find((version) => version.status === "ACTIVE");
  const readiness = {
    competition:
      configuration.competition.name.trim().length > 0 &&
      configuration.competition.slug.trim().length > 0,
    categories: configuration.categories.length > 0,
    activeTemplate: activeTemplate !== undefined,
    activeTemplateFile: activeTemplate?.file != null,
    activeRubric: activeRubric !== undefined,
    rubricHasCriteria: (activeRubric?.criteria.length ?? 0) > 0,
  };

  return CompetitionConfigurationReadinessSchema.parse({
    ...readiness,
    ready: Object.values(readiness).every(Boolean),
  });
}
