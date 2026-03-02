import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  CORS_ORIGIN: z.string().min(1),

  SESSION_SECRET: z.string().min(32),
  JWT_SECRET: z.string().min(32),

  PUBLIC_BASE_URL: z.string().url(),
  GOOGLE_REDIRECT_PATH: z.string().min(1),

  // Perfex DB
  PERFEX_DB_HOST: z.string().min(1),
  PERFEX_DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  PERFEX_DB_USER: z.string().min(1),
  PERFEX_DB_PASSWORD: z.string().default(""),
  PERFEX_DB_NAME: z.string().min(1),
  PERFEX_DB_PREFIX: z.string().min(1).default("tbl"),

  // Google (optional during setup)
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

  // Microsoft (optional during setup)
  MICROSOFT_CLIENT_ID: z.string().min(1).optional(),
  MICROSOFT_CLIENT_SECRET: z.string().min(1).optional(),
  MICROSOFT_TENANT: z.string().min(1).default("common").optional(),

  // Apple (optional during setup)
  APPLE_CLIENT_ID: z.string().min(1).optional(),
  APPLE_TEAM_ID: z.string().min(1).optional(),
  APPLE_KEY_ID: z.string().min(1).optional(),
  APPLE_PRIVATE_KEY_BASE64: z.string().min(1).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  CORS_ORIGIN: process.env.CORS_ORIGIN,

  SESSION_SECRET: process.env.SESSION_SECRET,
  JWT_SECRET: process.env.JWT_SECRET,

  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL,
  GOOGLE_REDIRECT_PATH: process.env.GOOGLE_REDIRECT_PATH,

  PERFEX_DB_HOST: process.env.PERFEX_DB_HOST,
  PERFEX_DB_PORT: process.env.PERFEX_DB_PORT,
  PERFEX_DB_USER: process.env.PERFEX_DB_USER,
  PERFEX_DB_PASSWORD: process.env.PERFEX_DB_PASSWORD,
  PERFEX_DB_NAME: process.env.PERFEX_DB_NAME,
  PERFEX_DB_PREFIX: process.env.PERFEX_DB_PREFIX,

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,

  MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET,
  MICROSOFT_TENANT: process.env.MICROSOFT_TENANT,

  APPLE_CLIENT_ID: process.env.APPLE_CLIENT_ID,
  APPLE_TEAM_ID: process.env.APPLE_TEAM_ID,
  APPLE_KEY_ID: process.env.APPLE_KEY_ID,
  APPLE_PRIVATE_KEY_BASE64: process.env.APPLE_PRIVATE_KEY_BASE64,
});

export const googleRedirectUri = new URL(
  env.GOOGLE_REDIRECT_PATH,
  env.PUBLIC_BASE_URL
).toString();