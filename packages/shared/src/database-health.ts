import { z } from "zod";

export const DatabaseHealthResponseSchema = z.object({
  status: z.literal("ok"),
  database: z.literal("d1"),
});

export type DatabaseHealthResponse = z.infer<typeof DatabaseHealthResponseSchema>;

export function createDatabaseHealthResponse(): DatabaseHealthResponse {
  return DatabaseHealthResponseSchema.parse({
    status: "ok",
    database: "d1",
  });
}
