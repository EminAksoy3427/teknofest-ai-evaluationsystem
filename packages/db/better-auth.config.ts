import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { createDb } from "./src/client";

// Schema generation inspects adapter metadata and never queries this placeholder binding.
const schemaGenerationDb = createDb({} as D1Database);

export const auth = betterAuth({
  baseURL: "http://localhost:5173",
  database: drizzleAdapter(schemaGenerationDb, {
    provider: "sqlite",
  }),
});
