import { Pool } from "pg";
import { loadConfig, generateKeySet, keySetFromPem, type KeySet } from "@sso/common";
import { createApp } from "./app.ts";
import { PgAuthStore, ensureSchema } from "./db/repo.ts";
import { seedIdentities } from "./db/seed.ts";

/**
 * Production wiring for the IdP (:8000). The factory (app.ts) stays pure; this is
 * where the real Postgres pool and signing key are injected.
 *
 * Signing key: provide IDP_PRIVATE_KEY_PEM + IDP_PUBLIC_KEY_PEM in prod. In dev,
 * if they are absent we generate an EPHEMERAL keypair (the JWKS then changes on
 * every restart — fine for local study, never for prod).
 */
async function loadKeySet(): Promise<KeySet> {
  const priv = process.env.IDP_PRIVATE_KEY_PEM;
  const pub = process.env.IDP_PUBLIC_KEY_PEM;
  if (priv && pub) return keySetFromPem(priv, pub);
  console.warn("[auth-service] IDP_*_KEY_PEM not set — generating an EPHEMERAL keypair (dev only).");
  return generateKeySet();
}

async function main(): Promise<void> {
  const config = loadConfig(process.env, { dbUrlKey: "AUTH_DATABASE_URL" });
  if (!config.databaseUrl) throw new Error("AUTH_DATABASE_URL is required");

  const pool = new Pool({ connectionString: config.databaseUrl });
  await ensureSchema(pool);

  const store = new PgAuthStore(pool);
  await seedIdentities(store);

  const keySet = await loadKeySet();
  const app = createApp({
    store,
    keySet,
    issuer: config.issuer,
    audience: config.audience,
  });

  const port = Number(process.env.PORT ?? 8000);
  app.listen(port, () => console.log(`[auth-service] IdP listening on :${port} (kid=${keySet.kid})`));
}

main().catch((err) => {
  console.error("[auth-service] failed to start:", err);
  process.exit(1);
});
