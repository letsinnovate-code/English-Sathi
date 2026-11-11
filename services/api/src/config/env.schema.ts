import { z } from "zod";

/**
 * Zod schema enforcing strict environment variable contracts.
 */
export const EnvSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    API_PREFIX: z.string().default("api/v1"),
    CORS_ORIGINS: z
        .string()
        .default("http://localhost:3000,http://localhost:3001"),
    DATABASE_URL: z
        .string()
        .default("postgresql://postgres:postgres@localhost:5432/english_sathi?schema=public"),
    REDIS_URL: z.string().default("redis://localhost:6379"),
    JWT_SECRET: z
        .string()
        .min(16, "JWT_SECRET must be at least 16 characters for security")
        .default("dev_super_secret_jwt_key_at_least_16_chars"),
    JWT_EXPIRES_IN: z.string().default("7d"),
    GEMINI_API_KEY: z.string().optional(),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

/**
 * Custom validation function passed to NestJS ConfigModule.forRoot.
 * Fails fast with human-readable error messages if environment is invalid.
 */
export function validateEnv(config: Record<string, unknown>): EnvConfig {
    const result = EnvSchema.safeParse(config);

    if (!result.success) {
        const errorMessages = result.error.errors
            .map((issue) => `  - [${issue.path.join(".")}]: ${issue.message}`)
            .join("\n");

        throw new Error(`\n❌ Environment Configuration Validation Failed:\n${errorMessages}\n`);
    }

    return result.data;
}