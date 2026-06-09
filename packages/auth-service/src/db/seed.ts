import { hashPassword } from "@sso/common";
import type { AuthStore } from "../types.ts";

/** Dev/demo seed password for the canned accounts. */
export const SEED_PASSWORD = "password123";

/**
 * Seed the canned demo identities (idempotent — skips any that already exist):
 *   alice → tenant_a            (Flow B: 403 at tenant B)
 *   bob   → tenant_a + tenant_b (Flow A: 200 at both)
 */
export async function seedIdentities(store: AuthStore): Promise<void> {
  const hash = await hashPassword(SEED_PASSWORD);

  const accounts = [
    { sub: "u_alice", email: "alice@example.com", name: "Alice", grants: { tenant_a: ["member"] } },
    { sub: "u_bob", email: "bob@example.com", name: "Bob", grants: { tenant_a: ["member"], tenant_b: ["member"] } },
  ];

  for (const acct of accounts) {
    if (await store.findIdentityByEmail(acct.email)) continue;
    await store.createIdentity({ sub: acct.sub, email: acct.email, passwordHash: hash, name: acct.name });
    for (const [tenantId, roles] of Object.entries(acct.grants)) {
      await store.grantEntitlement(acct.sub, tenantId, roles);
    }
  }
}
