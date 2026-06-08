import { z } from "zod";

/**
 * Pinned constants — the single source of truth for the token/trust model.
 * Nothing elsewhere in the codebase may hardcode these values.
 *
 * See specs/00-infra.md and docs/adr/0001-0002 (RS256 + alg pinning).
 */

/** Signing algorithm. Asymmetric (ADR-0001) and pinned on verify (ADR-0002). */
export const ALG = "RS256" as const;

/** `iss` claim default for local dev (overridable via the ISSUER env var). */
export const ISSUER_DEFAULT = "http://localhost:8000" as const;

/** `aud` claim default — the tenants are the audience of the token. */
export const AUDIENCE_DEFAULT = "platform-tenants" as const;

/** Access tokens live 15 minutes — short life limits theft damage. */
export const ACCESS_TOKEN_TTL_SECONDS = 900;

/** Tolerate ±60s of clock skew between IdP and tenants when checking exp/iat. */
export const CLOCK_LEEWAY_SECONDS = 60;

/** The tenants known to the system. */
export const TENANT_IDS = ["tenant_a", "tenant_b"] as const;
export type TenantId = (typeof TENANT_IDS)[number];

/** Parsed, validated runtime configuration for a service. */
export interface AppConfig {
  issuer: string;
  audience: string;
  /** Connection string for THIS service's database (see dbUrlKey). */
  databaseUrl: string | undefined;
  /** Present for tenant-service instances; identifies which tenant this is. */
  tenantId: TenantId | undefined;
}

export interface LoadConfigOptions {
  /**
   * Which env var holds this service's database URL. Defaults to the IdP's.
   * tenant-service passes "TENANT_A_DATABASE_URL" / "TENANT_B_DATABASE_URL".
   */
  dbUrlKey?: string;
}

const envSchema = z.object({
  ISSUER: z.string().url().default(ISSUER_DEFAULT),
  AUDIENCE: z.string().min(1).default(AUDIENCE_DEFAULT),
  TENANT_ID: z.enum(TENANT_IDS).optional(),
});

/**
 * Read and validate configuration from an env-like record (defaults to
 * `process.env`). Throws a clear error on a malformed ISSUER or unknown
 * TENANT_ID, so a service fails fast at boot rather than misbehaving later.
 */
export function loadConfig(
  env: Record<string, string | undefined> = process.env,
  options: LoadConfigOptions = {},
): AppConfig {
  const parsed = envSchema.parse(env);
  const dbUrlKey = options.dbUrlKey ?? "AUTH_DATABASE_URL";

  return {
    issuer: parsed.ISSUER,
    audience: parsed.AUDIENCE,
    databaseUrl: env[dbUrlKey],
    tenantId: parsed.TENANT_ID,
  };
}
