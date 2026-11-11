import { z } from "zod";
import { EnvSchema as BaseEnvSchema } from "./env.schema";

export const EnvSchema = BaseEnvSchema.extend({
  REFRESH_TOKEN_SECRET: z
    .string()
    .min(16, "REFRESH_TOKEN_SECRET must be at least 16 characters")
    .default("dev_refresh_token_secret_at_least_16_chars"),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default("30d"),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

