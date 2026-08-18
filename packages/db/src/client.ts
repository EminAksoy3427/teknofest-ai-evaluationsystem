import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema";

export function createDb(binding: D1Database) {
  return drizzle(binding, { schema });
}

export type Database = ReturnType<typeof createDb>;

export async function assertDatabaseConnection(binding: D1Database): Promise<void> {
  const result = await createDb(binding).get<{ ok: number }>(sql`select 1 as ok`);

  if (result?.ok !== 1) {
    throw new Error("D1 health query returned an unexpected result");
  }
}
