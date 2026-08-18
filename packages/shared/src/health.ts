import { z } from "zod";

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("teknofest-ai-evaluationsystem"),
  version: z.literal(1),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export function createHealthResponse(): HealthResponse {
  return HealthResponseSchema.parse({
    status: "ok",
    service: "teknofest-ai-evaluationsystem",
    version: 1,
  });
}
