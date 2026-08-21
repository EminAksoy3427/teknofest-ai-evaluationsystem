import { DatabaseSync } from "node:sqlite";

// Test-only harness. It applies the real generated migration chain to an in-memory SQLite database
// and exposes the small `D1Database` surface the repository layer uses, so repository SQL,
// CHECK constraints and composite foreign keys are exercised exactly as generated. Production
// composition never imports this module.
const migrationSources = import.meta.glob("../../../../../packages/db/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const migrationChain: Array<{ name: string; sql: string }> = Object.keys(migrationSources)
  .sort()
  .map((path) => ({
    name: path.split("/").at(-1) ?? path,
    sql: migrationSources[path] as string,
  }));

function toD1All(rows: Array<Record<string, unknown>>) {
  return { results: rows, success: true, meta: { changes: 0, duration: 0 } };
}

function isReadStatement(sql: string): boolean {
  return /^\s*(select|pragma|with)\b/iu.test(sql);
}

class LocalD1PreparedStatement {
  readonly #database: DatabaseSync;
  readonly #sql: string;
  readonly #values: readonly unknown[];

  constructor(database: DatabaseSync, sql: string, values: readonly unknown[] = []) {
    this.#database = database;
    this.#sql = sql;
    this.#values = values;
  }

  bind(...values: unknown[]) {
    return new LocalD1PreparedStatement(this.#database, this.#sql, values);
  }

  async all() {
    return toD1All(this.#database.prepare(this.#sql).all(...this.#values));
  }

  async first(column?: string) {
    const row = this.#database.prepare(this.#sql).get(...this.#values) ?? null;
    if (row === null) return null;
    return column === undefined ? row : (row[column] ?? null);
  }

  async run() {
    if (isReadStatement(this.#sql)) {
      const rows = this.#database.prepare(this.#sql).all(...this.#values);
      return { ...toD1All(rows), meta: { changes: 0, duration: 0 } };
    }
    const result = this.#database.prepare(this.#sql).run(...this.#values);
    return { results: [], success: true, meta: { changes: Number(result.changes), duration: 0 } };
  }

  async raw() {
    // Positional rows are required, not derived from the object form: a joined SELECT can repeat a
    // column name across tables (`criterion.id` and `rubric_suggestion.id`), and the object form
    // silently collapses those duplicates. Drizzle maps joined selections by position, so reading
    // `Object.values()` of a collapsed row would shift every column after the first collision.
    const statement = this.#database.prepare(this.#sql);
    statement.setReturnArrays(true);
    return statement.all(...this.#values) as unknown as unknown[][];
  }
}

export interface LocalD1 {
  binding: D1Database;
  exec(sql: string): void;
  query<T = Record<string, unknown>>(sql: string, ...values: unknown[]): T[];
  close(): void;
}

/**
 * Creates an in-memory database with foreign key enforcement enabled and the full generated
 * migration chain applied. `upToMigrationCount` allows validating the upgrade path from an earlier
 * committed migration state.
 */
export function createLocalD1(upToMigrationCount = migrationChain.length): LocalD1 {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  for (const migration of migrationChain.slice(0, upToMigrationCount)) {
    database.exec(migration.sql);
  }
  // `DatabaseSync` is one synchronous connection: two overlapping `BEGIN`s on it raise "cannot
  // start a transaction within a transaction", which real D1 never does (each batch is its own
  // atomic unit on Cloudflare's infrastructure). Chaining batches onto this promise serializes their
  // transactions without serializing the plain (non-batched) queries a caller runs before deciding
  // to write — so two concurrent callers can still both observe "no row yet" and both attempt to
  // insert, and the real UNIQUE-constraint race a retried/concurrent request would hit in production
  // is still exercised when their batches run one after the other.
  let pendingBatch: Promise<unknown> = Promise.resolve();
  const binding = {
    prepare: (sql: string) => new LocalD1PreparedStatement(database, sql),
    // D1 runs a batch as a single implicit transaction. The fixture mirrors that so repository
    // code which depends on all-or-nothing batch semantics is exercised the same way here.
    batch: (statements: readonly LocalD1PreparedStatement[]) => {
      const run = pendingBatch.then(async () => {
        database.exec("BEGIN");
        try {
          const results = [];
          for (const statement of statements) results.push(await statement.run());
          database.exec("COMMIT");
          return results;
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }
      });
      // Chain unconditionally (even on rejection) so a failed batch never wedges later callers.
      pendingBatch = run.catch(() => undefined);
      return run;
    },
  } as unknown as D1Database;
  return {
    binding,
    exec: (sql: string) => database.exec(sql),
    query: <T>(sql: string, ...values: unknown[]) =>
      database.prepare(sql).all(...values) as unknown as T[],
    close: () => database.close(),
  };
}

export function applyRemainingMigrations(local: LocalD1, fromMigrationCount: number): void {
  for (const migration of migrationChain.slice(fromMigrationCount)) local.exec(migration.sql);
}

// ---------------------------------------------------------------------------
// Synthetic competition seeding shared by the similarity persistence tests.
// ---------------------------------------------------------------------------

const SEED_STRUCTURAL_PROFILE = JSON.stringify({
  expectedLanguage: "tr",
  sections: [{ key: "summary", title: "Proje Özeti", description: "", required: true, order: 1 }],
});

export interface SeedRun {
  id: string;
  submissionId: string;
  competition: "a" | "b";
  sha: string;
  completedAt: number;
}

export interface SeedSubmission {
  id: string;
  competition: "a" | "b";
}

export interface SimilarityPairRow {
  id: string;
  competition_id: string;
  submission_a_id: string;
  submission_b_id: string;
  analysis_run_a_id: string;
  analysis_run_b_id: string;
  combined_score: number;
  created_at: number;
  updated_at: number;
}

/** Two synthetic competitions with categories, active template/rubric versions and the given
 * submissions and successful AnalysisRuns. `SEMANTIC_CHECKS` is used as the stage so the same seed
 * is valid before and after the P4-01A migration. */
export function seedCompetitions(
  local: LocalD1,
  runs: readonly SeedRun[],
  submissions: readonly SeedSubmission[],
  /** Structural profile pinned on both seeded TemplateVersions. Candidate documents are segmented
   * with this profile, so it must match the profile the source run is analysed with. */
  structuralProfile: string = SEED_STRUCTURAL_PROFILE,
): void {
  local.exec(`
    INSERT INTO competition (id, name, slug, description) VALUES
      ('competition-a', 'A', 'a', 'Sentetik'), ('competition-b', 'B', 'b', 'Sentetik');
    INSERT INTO category (id, competition_id, name, code, description) VALUES
      ('category-a', 'competition-a', 'A', 'a', 'Sentetik'),
      ('category-b', 'competition-b', 'B', 'b', 'Sentetik');
    INSERT INTO template_version (id, competition_id, version_number, label, status, structural_profile) VALUES
      ('template-a', 'competition-a', 1, 'A', 'ACTIVE', '${structuralProfile}'),
      ('template-b', 'competition-b', 1, 'B', 'ACTIVE', '${structuralProfile}');
    INSERT INTO rubric_version (id, competition_id, version_number, label, status) VALUES
      ('rubric-a', 'competition-a', 1, 'A', 'ACTIVE'),
      ('rubric-b', 'competition-b', 1, 'B', 'ACTIVE');
  `);
  for (const submission of submissions) {
    local.exec(
      `INSERT INTO submission (id, competition_id, category_id, application_code, project_title)
       VALUES ('${submission.id}', 'competition-${submission.competition}', 'category-${submission.competition}', '${submission.id}', 'Proje ${submission.id}')`,
    );
  }
  for (const run of runs) {
    local.exec(
      `INSERT INTO analysis_run (
         id, submission_id, category_id, template_version_id, rubric_version_id, source_sha256,
         status, stage, workflow_instance_id, document_artifact_key, page_count, character_count,
         extraction_warnings, created_at, started_at, completed_at
       ) VALUES (
         '${run.id}', '${run.submissionId}', 'category-${run.competition}', 'template-${run.competition}',
         'rubric-${run.competition}', '${run.sha}', 'SUCCEEDED', 'SEMANTIC_CHECKS', '${run.id}',
         '${run.id}.json', 1, 100, '[]', ${run.completedAt}, ${run.completedAt}, ${run.completedAt}
       )`,
    );
  }
}

export function similarityPairRows(local: LocalD1): SimilarityPairRow[] {
  return local.query<SimilarityPairRow>("SELECT * FROM similarity_pair ORDER BY id");
}

/** Deterministic synthetic 64-character lowercase hex content hash. */
export function syntheticSha256(index: number): string {
  return index.toString(16).padStart(64, "0");
}
