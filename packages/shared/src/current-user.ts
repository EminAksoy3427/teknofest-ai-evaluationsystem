import { z } from "zod";

export const CurrentUserResponseSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    email: z.email(),
    image: z.string().nullable(),
  })
  .strict();

export type CurrentUserResponse = z.infer<typeof CurrentUserResponseSchema>;

export const UnauthorizedResponseSchema = z
  .object({
    code: z.literal("UNAUTHORIZED"),
    message: z.literal("Oturum açmanız gerekiyor."),
  })
  .strict();

export type UnauthorizedResponse = z.infer<typeof UnauthorizedResponseSchema>;

export function createCurrentUserResponse(user: CurrentUserResponse): CurrentUserResponse {
  return CurrentUserResponseSchema.parse(user);
}

export function createUnauthorizedResponse(): UnauthorizedResponse {
  return UnauthorizedResponseSchema.parse({
    code: "UNAUTHORIZED",
    message: "Oturum açmanız gerekiyor.",
  });
}
