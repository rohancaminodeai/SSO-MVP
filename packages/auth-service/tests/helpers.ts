import bcrypt from "bcrypt";
import { generateKeySet, type KeySet } from "@sso/common";
import { createApp } from "../src/app.ts";
import type { AuthStore, Identity } from "../src/types.ts";

export const ISSUER = "http://localhost:8000";
export const AUDIENCE = "platform-tenants";
export const SEED_PASSWORD = "password123";

/** In-memory AuthStore for tests — no Postgres. Mirrors the pg repo's contract. */
export class InMemoryStore implements AuthStore {
  private byEmail = new Map<string, Identity>();
  private entsBySub = new Map<string, Record<string, string[]>>();

  async findIdentityByEmail(email: string): Promise<Identity | null> {
    return this.byEmail.get(email.toLowerCase()) ?? null;
  }
  async createIdentity(identity: Identity): Promise<void> {
    this.byEmail.set(identity.email.toLowerCase(), identity);
  }
  async getEntitlements(sub: string): Promise<Record<string, string[]>> {
    return this.entsBySub.get(sub) ?? {};
  }
  async grantEntitlement(sub: string, tenantId: string, roles: string[]): Promise<void> {
    const ents = this.entsBySub.get(sub) ?? {};
    ents[tenantId] = roles;
    this.entsBySub.set(sub, ents);
  }
}

export interface TestApp {
  app: ReturnType<typeof createApp>;
  keySet: KeySet;
  store: InMemoryStore;
}

/**
 * Build an IdP app over a freshly seeded in-memory store + ephemeral keypair.
 * Seeds alice (tenant_a) and bob (tenant_a + tenant_b), both with SEED_PASSWORD.
 * Hashes are computed with bcrypt directly so the fixture does not depend on the
 * code under test.
 */
export async function makeApp(overrides: Partial<Parameters<typeof createApp>[0]> = {}): Promise<TestApp> {
  const keySet = await generateKeySet();
  const store = new InMemoryStore();
  const hash = await bcrypt.hash(SEED_PASSWORD, 10);

  await store.createIdentity({ sub: "u_alice", email: "alice@example.com", passwordHash: hash, name: "Alice" });
  await store.grantEntitlement("u_alice", "tenant_a", ["member"]);

  await store.createIdentity({ sub: "u_bob", email: "bob@example.com", passwordHash: hash, name: "Bob" });
  await store.grantEntitlement("u_bob", "tenant_a", ["member"]);
  await store.grantEntitlement("u_bob", "tenant_b", ["member"]);

  const app = createApp({ store, keySet, issuer: ISSUER, audience: AUDIENCE, ...overrides });
  return { app, keySet, store };
}
