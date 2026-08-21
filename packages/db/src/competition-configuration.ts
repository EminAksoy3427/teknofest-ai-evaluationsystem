import {
  type CategoryCreateRequest,
  type CategoryResponse,
  type CategoryUpdateRequest,
  type CompetitionConfigurationResponse,
  type CompetitionCreateRequest,
  type CompetitionResponse,
  type CompetitionUpdateRequest,
  type CriteriaReplaceRequest,
  deriveConfigurationReadiness,
  isTemplateProfileActivatable,
  type RubricVersionCreateRequest,
  type RubricVersionResponse,
  type RubricVersionUpdateRequest,
  TemplateStructuralProfileSchema,
  type TemplateVersionCreateRequest,
  type TemplateVersionResponse,
  type TemplateVersionUpdateRequest,
  type VersionStatus,
} from "@teknofest-ai/shared";
import { and, asc, desc, eq, ne } from "drizzle-orm";

import { createDb } from "./client";
import {
  categories,
  competitionMembers,
  competitions,
  criteria,
  rubricVersions,
  submissions,
  templateVersions,
} from "./schema";

export type ConfigurationRepositoryErrorCode = "NOT_FOUND" | "CONFLICT";

export type ConfigurationRepositoryErrorReason =
  | "COMPETITION_SLUG"
  | "CATEGORY_CODE"
  | "CATEGORY_IN_USE"
  | "IMMUTABLE_VERSION"
  | "TEMPLATE_NOT_READY"
  | "RUBRIC_NOT_READY"
  | "VERSION_NUMBER"
  | "RESOURCE";

export class ConfigurationRepositoryError extends Error {
  readonly code: ConfigurationRepositoryErrorCode;
  readonly reason: ConfigurationRepositoryErrorReason;

  constructor(code: ConfigurationRepositoryErrorCode, reason: ConfigurationRepositoryErrorReason) {
    super(`${code}:${reason}`);
    this.name = "ConfigurationRepositoryError";
    this.code = code;
    this.reason = reason;
  }
}

function timestamp(value: Date | number): number {
  return value instanceof Date ? value.getTime() : value;
}

function publicVersionStatus(status: "DRAFT" | "ACTIVE" | "ARCHIVED" | "RETIRED"): VersionStatus {
  return status === "ARCHIVED" ? "RETIRED" : status;
}

function mapCompetition(row: typeof competitions.$inferSelect): CompetitionResponse {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    createdAt: timestamp(row.createdAt),
    updatedAt: timestamp(row.updatedAt),
  };
}

function mapCategory(row: typeof categories.$inferSelect): CategoryResponse {
  return {
    id: row.id,
    competitionId: row.competitionId,
    name: row.name,
    code: row.code,
    description: row.description,
    guidance: row.guidance,
    order: row.sortOrder,
    createdAt: timestamp(row.createdAt),
    updatedAt: timestamp(row.updatedAt),
  };
}

function parseStructuralProfile(value: string) {
  return TemplateStructuralProfileSchema.parse(JSON.parse(value));
}

function mapTemplate(row: typeof templateVersions.$inferSelect): TemplateVersionResponse {
  return {
    id: row.id,
    competitionId: row.competitionId,
    versionNumber: row.versionNumber,
    label: row.label,
    status: publicVersionStatus(row.status),
    structuralProfile: parseStructuralProfile(row.structuralProfile),
    createdAt: timestamp(row.createdAt),
    updatedAt: timestamp(row.updatedAt),
  };
}

function mapCriterion(row: typeof criteria.$inferSelect) {
  return {
    id: row.id,
    rubricVersionId: row.rubricVersionId,
    code: row.code,
    name: row.title,
    description: row.description,
    maxScore: row.maxScore,
    weight: row.weightBasisPoints / 100,
    evidenceExpectation: row.evidenceExpectation,
    order: row.sortOrder,
    createdAt: timestamp(row.createdAt),
    updatedAt: timestamp(row.updatedAt),
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && /unique constraint|unique/i.test(error.message);
}

function isForeignKeyConstraintError(error: unknown): boolean {
  return error instanceof Error && /foreign key constraint|foreign key/i.test(error.message);
}

export async function createCompetitionWithManager(
  binding: D1Database,
  userId: string,
  input: CompetitionCreateRequest,
): Promise<CompetitionResponse> {
  const db = createDb(binding);
  const [duplicate] = await db
    .select({ id: competitions.id })
    .from(competitions)
    .where(eq(competitions.slug, input.slug))
    .limit(1);

  if (duplicate) {
    throw new ConfigurationRepositoryError("CONFLICT", "COMPETITION_SLUG");
  }

  const now = new Date();
  const competition = {
    id: crypto.randomUUID(),
    name: input.name,
    slug: input.slug,
    description: input.description,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await db.batch([
      db.insert(competitions).values(competition),
      db.insert(competitionMembers).values({
        id: crypto.randomUUID(),
        competitionId: competition.id,
        userId,
        role: "COMPETITION_MANAGER",
        createdAt: now,
        updatedAt: now,
      }),
    ]);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConfigurationRepositoryError("CONFLICT", "COMPETITION_SLUG");
    }
    throw error;
  }

  return mapCompetition({
    ...competition,
    status: "DRAFT",
    expectedLanguage: "tr",
  });
}

export async function findCompetition(
  binding: D1Database,
  competitionId: string,
): Promise<CompetitionResponse | null> {
  const [row] = await createDb(binding)
    .select()
    .from(competitions)
    .where(eq(competitions.id, competitionId))
    .limit(1);

  return row ? mapCompetition(row) : null;
}

export async function updateCompetition(
  binding: D1Database,
  competitionId: string,
  input: CompetitionUpdateRequest,
): Promise<CompetitionResponse> {
  const db = createDb(binding);
  const existing = await findCompetition(binding, competitionId);

  if (!existing) {
    throw new ConfigurationRepositoryError("NOT_FOUND", "RESOURCE");
  }

  if (input.slug && input.slug !== existing.slug) {
    const [duplicate] = await db
      .select({ id: competitions.id })
      .from(competitions)
      .where(and(eq(competitions.slug, input.slug), ne(competitions.id, competitionId)))
      .limit(1);

    if (duplicate) {
      throw new ConfigurationRepositoryError("CONFLICT", "COMPETITION_SLUG");
    }
  }

  try {
    await db
      .update(competitions)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(competitions.id, competitionId));
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConfigurationRepositoryError("CONFLICT", "COMPETITION_SLUG");
    }
    throw error;
  }

  const updated = await findCompetition(binding, competitionId);
  if (!updated) {
    throw new ConfigurationRepositoryError("NOT_FOUND", "RESOURCE");
  }
  return updated;
}

export async function listCategories(
  binding: D1Database,
  competitionId: string,
): Promise<CategoryResponse[]> {
  const rows = await createDb(binding)
    .select()
    .from(categories)
    .where(eq(categories.competitionId, competitionId))
    .orderBy(asc(categories.sortOrder), asc(categories.name), asc(categories.id));

  return rows.map(mapCategory);
}

export async function createCategory(
  binding: D1Database,
  competitionId: string,
  input: CategoryCreateRequest,
): Promise<CategoryResponse> {
  const db = createDb(binding);
  const now = new Date();
  const row: typeof categories.$inferInsert = {
    id: crypto.randomUUID(),
    competitionId,
    name: input.name,
    code: input.code,
    description: input.description,
    guidance: input.guidance,
    sortOrder: input.order,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await db.insert(categories).values(row);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConfigurationRepositoryError("CONFLICT", "CATEGORY_CODE");
    }
    throw error;
  }

  return mapCategory(row as typeof categories.$inferSelect);
}

export async function updateCategory(
  binding: D1Database,
  competitionId: string,
  categoryId: string,
  input: CategoryUpdateRequest,
): Promise<CategoryResponse> {
  const db = createDb(binding);
  const [existing] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.competitionId, competitionId)))
    .limit(1);

  if (!existing) {
    throw new ConfigurationRepositoryError("NOT_FOUND", "RESOURCE");
  }

  const changes = {
    name: input.name,
    code: input.code,
    description: input.description,
    guidance: input.guidance,
    sortOrder: input.order,
    updatedAt: new Date(),
  };

  try {
    await db
      .update(categories)
      .set(changes)
      .where(and(eq(categories.id, categoryId), eq(categories.competitionId, competitionId)));
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConfigurationRepositoryError("CONFLICT", "CATEGORY_CODE");
    }
    throw error;
  }

  const [updated] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.competitionId, competitionId)))
    .limit(1);
  if (!updated) {
    throw new ConfigurationRepositoryError("NOT_FOUND", "RESOURCE");
  }
  return mapCategory(updated);
}

export async function deleteCategory(
  binding: D1Database,
  competitionId: string,
  categoryId: string,
): Promise<void> {
  const db = createDb(binding);
  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.competitionId, competitionId)))
    .limit(1);

  if (!existing) {
    throw new ConfigurationRepositoryError("NOT_FOUND", "RESOURCE");
  }

  const [dependentSubmission] = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(eq(submissions.categoryId, categoryId))
    .limit(1);
  if (dependentSubmission) {
    throw new ConfigurationRepositoryError("CONFLICT", "CATEGORY_IN_USE");
  }

  try {
    await db
      .delete(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.competitionId, competitionId)));
  } catch (error) {
    if (isForeignKeyConstraintError(error)) {
      throw new ConfigurationRepositoryError("CONFLICT", "CATEGORY_IN_USE");
    }
    throw error;
  }
}

export async function listTemplateVersions(
  binding: D1Database,
  competitionId: string,
): Promise<TemplateVersionResponse[]> {
  const rows = await createDb(binding)
    .select()
    .from(templateVersions)
    .where(eq(templateVersions.competitionId, competitionId))
    .orderBy(desc(templateVersions.versionNumber), desc(templateVersions.id));

  return rows.map(mapTemplate);
}

export async function createTemplateVersion(
  binding: D1Database,
  competitionId: string,
  input: TemplateVersionCreateRequest,
): Promise<TemplateVersionResponse> {
  const db = createDb(binding);
  const [latest] = await db
    .select({ versionNumber: templateVersions.versionNumber })
    .from(templateVersions)
    .where(eq(templateVersions.competitionId, competitionId))
    .orderBy(desc(templateVersions.versionNumber))
    .limit(1);
  const now = new Date();
  const row: typeof templateVersions.$inferInsert = {
    id: crypto.randomUUID(),
    competitionId,
    versionNumber: (latest?.versionNumber ?? 0) + 1,
    label: input.label,
    status: "DRAFT",
    structuralProfile: JSON.stringify(input.structuralProfile),
    createdAt: now,
    updatedAt: now,
  };

  try {
    await db.insert(templateVersions).values(row);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConfigurationRepositoryError("CONFLICT", "VERSION_NUMBER");
    }
    throw error;
  }

  return mapTemplate(row as typeof templateVersions.$inferSelect);
}

export async function updateDraftTemplateVersion(
  binding: D1Database,
  competitionId: string,
  templateVersionId: string,
  input: TemplateVersionUpdateRequest,
): Promise<TemplateVersionResponse> {
  const db = createDb(binding);
  const [existing] = await db
    .select()
    .from(templateVersions)
    .where(
      and(
        eq(templateVersions.id, templateVersionId),
        eq(templateVersions.competitionId, competitionId),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new ConfigurationRepositoryError("NOT_FOUND", "RESOURCE");
  }
  if (existing.status !== "DRAFT") {
    throw new ConfigurationRepositoryError("CONFLICT", "IMMUTABLE_VERSION");
  }

  await db
    .update(templateVersions)
    .set({
      label: input.label,
      structuralProfile: input.structuralProfile
        ? JSON.stringify(input.structuralProfile)
        : undefined,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(templateVersions.id, templateVersionId),
        eq(templateVersions.competitionId, competitionId),
        eq(templateVersions.status, "DRAFT"),
      ),
    );

  const [updated] = await db
    .select()
    .from(templateVersions)
    .where(
      and(
        eq(templateVersions.id, templateVersionId),
        eq(templateVersions.competitionId, competitionId),
      ),
    )
    .limit(1);
  if (!updated) {
    throw new ConfigurationRepositoryError("NOT_FOUND", "RESOURCE");
  }
  return mapTemplate(updated);
}

export async function activateTemplateVersion(
  binding: D1Database,
  competitionId: string,
  templateVersionId: string,
): Promise<TemplateVersionResponse> {
  const db = createDb(binding);
  const [target] = await db
    .select()
    .from(templateVersions)
    .where(
      and(
        eq(templateVersions.id, templateVersionId),
        eq(templateVersions.competitionId, competitionId),
      ),
    )
    .limit(1);

  if (!target) {
    throw new ConfigurationRepositoryError("NOT_FOUND", "RESOURCE");
  }
  if (target.status !== "DRAFT") {
    throw new ConfigurationRepositoryError("CONFLICT", "IMMUTABLE_VERSION");
  }
  if (!isTemplateProfileActivatable(parseStructuralProfile(target.structuralProfile))) {
    throw new ConfigurationRepositoryError("CONFLICT", "TEMPLATE_NOT_READY");
  }

  const now = new Date();
  const nowMilliseconds = now.getTime();
  await binding.batch([
    binding
      .prepare(
        `UPDATE template_version
         SET status = 'RETIRED', updated_at = ?
         WHERE competition_id = ?
           AND status = 'ACTIVE'
           AND id <> ?
           AND EXISTS (
             SELECT 1
             FROM template_version AS target
             WHERE target.id = ?
               AND target.competition_id = ?
               AND target.status = 'DRAFT'
               AND EXISTS (
                 SELECT 1
                 FROM json_each(json_extract(target.structural_profile, '$.sections')) AS section
                 WHERE json_extract(section.value, '$.required') = 1
               )
           )`,
      )
      .bind(nowMilliseconds, competitionId, templateVersionId, templateVersionId, competitionId),
    binding
      .prepare(
        `UPDATE template_version
         SET status = 'ACTIVE', updated_at = ?
         WHERE id = ?
           AND competition_id = ?
           AND status = 'DRAFT'
           AND EXISTS (
             SELECT 1
             FROM json_each(json_extract(structural_profile, '$.sections')) AS section
             WHERE json_extract(section.value, '$.required') = 1
           )`,
      )
      .bind(nowMilliseconds, templateVersionId, competitionId),
  ]);

  const [activated] = await db
    .select()
    .from(templateVersions)
    .where(
      and(
        eq(templateVersions.id, templateVersionId),
        eq(templateVersions.competitionId, competitionId),
      ),
    )
    .limit(1);
  if (!activated) {
    throw new ConfigurationRepositoryError("NOT_FOUND", "RESOURCE");
  }
  if (activated.status !== "ACTIVE") {
    throw new ConfigurationRepositoryError("CONFLICT", "TEMPLATE_NOT_READY");
  }
  return mapTemplate(activated);
}

export async function listCriteriaForRubric(binding: D1Database, rubricVersionId: string) {
  const rows = await createDb(binding)
    .select()
    .from(criteria)
    .where(eq(criteria.rubricVersionId, rubricVersionId))
    .orderBy(asc(criteria.sortOrder), asc(criteria.id));

  return rows.map(mapCriterion);
}

async function mapRubric(
  binding: D1Database,
  row: typeof rubricVersions.$inferSelect,
): Promise<RubricVersionResponse> {
  return {
    id: row.id,
    competitionId: row.competitionId,
    versionNumber: row.versionNumber,
    label: row.label,
    status: publicVersionStatus(row.status),
    criteria: await listCriteriaForRubric(binding, row.id),
    createdAt: timestamp(row.createdAt),
    updatedAt: timestamp(row.updatedAt),
  };
}

export async function listRubricVersions(
  binding: D1Database,
  competitionId: string,
): Promise<RubricVersionResponse[]> {
  const rows = await createDb(binding)
    .select()
    .from(rubricVersions)
    .where(eq(rubricVersions.competitionId, competitionId))
    .orderBy(desc(rubricVersions.versionNumber), desc(rubricVersions.id));

  return Promise.all(rows.map((row) => mapRubric(binding, row)));
}

export async function createRubricVersion(
  binding: D1Database,
  competitionId: string,
  input: RubricVersionCreateRequest,
): Promise<RubricVersionResponse> {
  const db = createDb(binding);
  const [latest] = await db
    .select({ versionNumber: rubricVersions.versionNumber })
    .from(rubricVersions)
    .where(eq(rubricVersions.competitionId, competitionId))
    .orderBy(desc(rubricVersions.versionNumber))
    .limit(1);
  const now = new Date();
  const row: typeof rubricVersions.$inferInsert = {
    id: crypto.randomUUID(),
    competitionId,
    versionNumber: (latest?.versionNumber ?? 0) + 1,
    label: input.label,
    status: "DRAFT",
    createdAt: now,
    updatedAt: now,
  };

  try {
    await db.insert(rubricVersions).values(row);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConfigurationRepositoryError("CONFLICT", "VERSION_NUMBER");
    }
    throw error;
  }

  return mapRubric(binding, row as typeof rubricVersions.$inferSelect);
}

export async function updateDraftRubricVersion(
  binding: D1Database,
  competitionId: string,
  rubricVersionId: string,
  input: RubricVersionUpdateRequest,
): Promise<RubricVersionResponse> {
  const db = createDb(binding);
  const [existing] = await db
    .select()
    .from(rubricVersions)
    .where(
      and(eq(rubricVersions.id, rubricVersionId), eq(rubricVersions.competitionId, competitionId)),
    )
    .limit(1);

  if (!existing) {
    throw new ConfigurationRepositoryError("NOT_FOUND", "RESOURCE");
  }
  if (existing.status !== "DRAFT") {
    throw new ConfigurationRepositoryError("CONFLICT", "IMMUTABLE_VERSION");
  }

  await db
    .update(rubricVersions)
    .set({ label: input.label, updatedAt: new Date() })
    .where(
      and(
        eq(rubricVersions.id, rubricVersionId),
        eq(rubricVersions.competitionId, competitionId),
        eq(rubricVersions.status, "DRAFT"),
      ),
    );

  const [updated] = await db
    .select()
    .from(rubricVersions)
    .where(
      and(eq(rubricVersions.id, rubricVersionId), eq(rubricVersions.competitionId, competitionId)),
    )
    .limit(1);
  if (!updated) {
    throw new ConfigurationRepositoryError("NOT_FOUND", "RESOURCE");
  }
  return mapRubric(binding, updated);
}

export async function replaceDraftCriteria(
  binding: D1Database,
  competitionId: string,
  rubricVersionId: string,
  input: CriteriaReplaceRequest,
): Promise<RubricVersionResponse> {
  const db = createDb(binding);
  const [rubric] = await db
    .select()
    .from(rubricVersions)
    .where(
      and(eq(rubricVersions.id, rubricVersionId), eq(rubricVersions.competitionId, competitionId)),
    )
    .limit(1);

  if (!rubric) {
    throw new ConfigurationRepositoryError("NOT_FOUND", "RESOURCE");
  }
  if (rubric.status !== "DRAFT") {
    throw new ConfigurationRepositoryError("CONFLICT", "IMMUTABLE_VERSION");
  }

  const now = new Date();
  const nowMilliseconds = now.getTime();
  const statements = [
    binding
      .prepare(
        `DELETE FROM criterion
         WHERE rubric_version_id = ?
           AND EXISTS (
             SELECT 1
             FROM rubric_version
             WHERE id = ?
               AND competition_id = ?
               AND status = 'DRAFT'
           )`,
      )
      .bind(rubricVersionId, rubricVersionId, competitionId),
    ...input.criteria.map((criterion) =>
      binding
        .prepare(
          `INSERT INTO criterion (
             id,
             rubric_version_id,
             code,
             title,
             description,
             evidence_expectation,
             max_score,
             weight_basis_points,
             sort_order,
             created_at,
             updated_at
           )
           SELECT ?, id, ?, ?, ?, ?, ?, ?, ?, ?, ?
           FROM rubric_version
           WHERE id = ?
             AND competition_id = ?
             AND status = 'DRAFT'`,
        )
        .bind(
          crypto.randomUUID(),
          criterion.code,
          criterion.name,
          criterion.description,
          criterion.evidenceExpectation,
          criterion.maxScore,
          Math.round(criterion.weight * 100),
          criterion.order,
          nowMilliseconds,
          nowMilliseconds,
          rubricVersionId,
          competitionId,
        ),
    ),
    binding
      .prepare(
        `UPDATE rubric_version
         SET updated_at = ?
         WHERE id = ?
           AND competition_id = ?
           AND status = 'DRAFT'`,
      )
      .bind(nowMilliseconds, rubricVersionId, competitionId),
  ];

  const results = await binding.batch(statements);
  const touchResult = results.at(-1);

  if (touchResult?.meta.changes !== 1) {
    throw new ConfigurationRepositoryError("CONFLICT", "IMMUTABLE_VERSION");
  }

  return mapRubric(binding, { ...rubric, updatedAt: now });
}

export async function activateRubricVersion(
  binding: D1Database,
  competitionId: string,
  rubricVersionId: string,
): Promise<RubricVersionResponse> {
  const db = createDb(binding);
  const [target] = await db
    .select()
    .from(rubricVersions)
    .where(
      and(eq(rubricVersions.id, rubricVersionId), eq(rubricVersions.competitionId, competitionId)),
    )
    .limit(1);

  if (!target) {
    throw new ConfigurationRepositoryError("NOT_FOUND", "RESOURCE");
  }
  if (target.status !== "DRAFT") {
    throw new ConfigurationRepositoryError("CONFLICT", "IMMUTABLE_VERSION");
  }

  const [firstCriterion] = await db
    .select({ id: criteria.id })
    .from(criteria)
    .where(eq(criteria.rubricVersionId, rubricVersionId))
    .limit(1);
  if (!firstCriterion) {
    throw new ConfigurationRepositoryError("CONFLICT", "RUBRIC_NOT_READY");
  }

  const now = new Date();
  const nowMilliseconds = now.getTime();
  await binding.batch([
    binding
      .prepare(
        `UPDATE rubric_version
         SET status = 'RETIRED', updated_at = ?
         WHERE competition_id = ?
           AND status = 'ACTIVE'
           AND id <> ?
           AND EXISTS (
             SELECT 1
             FROM rubric_version AS target
             WHERE target.id = ?
               AND target.competition_id = ?
               AND target.status = 'DRAFT'
               AND EXISTS (
                 SELECT 1
                 FROM criterion
                 WHERE rubric_version_id = target.id
               )
           )`,
      )
      .bind(nowMilliseconds, competitionId, rubricVersionId, rubricVersionId, competitionId),
    binding
      .prepare(
        `UPDATE rubric_version
         SET status = 'ACTIVE', updated_at = ?
         WHERE id = ?
           AND competition_id = ?
           AND status = 'DRAFT'
           AND EXISTS (
             SELECT 1
             FROM criterion
             WHERE rubric_version_id = rubric_version.id
           )`,
      )
      .bind(nowMilliseconds, rubricVersionId, competitionId),
  ]);

  const [activated] = await db
    .select()
    .from(rubricVersions)
    .where(
      and(eq(rubricVersions.id, rubricVersionId), eq(rubricVersions.competitionId, competitionId)),
    )
    .limit(1);
  if (!activated) {
    throw new ConfigurationRepositoryError("NOT_FOUND", "RESOURCE");
  }
  if (activated.status !== "ACTIVE") {
    throw new ConfigurationRepositoryError("CONFLICT", "RUBRIC_NOT_READY");
  }
  return mapRubric(binding, activated);
}

export async function getCompetitionConfiguration(
  binding: D1Database,
  competitionId: string,
): Promise<CompetitionConfigurationResponse> {
  const competition = await findCompetition(binding, competitionId);
  if (!competition) {
    throw new ConfigurationRepositoryError("NOT_FOUND", "RESOURCE");
  }

  const [categoryList, templates, rubrics] = await Promise.all([
    listCategories(binding, competitionId),
    listTemplateVersions(binding, competitionId),
    listRubricVersions(binding, competitionId),
  ]);
  const configuration = { competition, categories: categoryList, templates, rubrics };

  return {
    ...configuration,
    readiness: deriveConfigurationReadiness(configuration),
  };
}

export const competitionConfigurationRepository = {
  activateRubricVersion,
  activateTemplateVersion,
  createCategory,
  createCompetitionWithManager,
  createRubricVersion,
  createTemplateVersion,
  deleteCategory,
  findCompetition,
  getCompetitionConfiguration,
  listCategories,
  listCriteriaForRubric,
  listRubricVersions,
  listTemplateVersions,
  replaceDraftCriteria,
  updateCategory,
  updateCompetition,
  updateDraftRubricVersion,
  updateDraftTemplateVersion,
};

export type CompetitionConfigurationRepository = typeof competitionConfigurationRepository;
