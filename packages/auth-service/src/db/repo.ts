import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
import type { AuthStore, Identity } from "../types.ts";

/** Postgres-backed AuthStore — the production counterpart of the in-memory test store. */
export class PgAuthStore implements AuthStore {
  constructor(private readonly pool: Pool) {}

  async findIdentityByEmail(email: string): Promise<Identity | null> {
    const { rows } = await this.pool.query(
      "SELECT sub, email, password_hash, name FROM identities WHERE email = $1",
      [email.toLowerCase()],
    );
    const r = rows[0];
    return r ? { sub: r.sub, email: r.email, passwordHash: r.password_hash, name: r.name } : null;
  }

  async createIdentity(i: Identity): Promise<void> {
    await this.pool.query(
      "INSERT INTO identities (sub, email, password_hash, name) VALUES ($1, $2, $3, $4)",
      [i.sub, i.email.toLowerCase(), i.passwordHash, i.name],
    );
  }

  async getEntitlements(sub: string): Promise<Record<string, string[]>> {
    const { rows } = await this.pool.query(
      "SELECT tenant_id, roles FROM entitlements WHERE sub = $1",
      [sub],
    );
    const out: Record<string, string[]> = {};
    for (const r of rows) out[r.tenant_id] = r.roles;
    return out;
  }

  async grantEntitlement(sub: string, tenantId: string, roles: string[]): Promise<void> {
    await this.pool.query(
      `INSERT INTO entitlements (sub, tenant_id, roles) VALUES ($1, $2, $3)
       ON CONFLICT (sub, tenant_id) DO UPDATE SET roles = EXCLUDED.roles`,
      [sub, tenantId, roles],
    );
  }
}

/** Create the auth_db tables if they do not exist (idempotent). */
export async function ensureSchema(pool: Pool): Promise<void> {
  const sqlPath = fileURLToPath(new URL("./schema.sql", import.meta.url));
  const sql = await readFile(sqlPath, "utf8");
  await pool.query(sql);
}
