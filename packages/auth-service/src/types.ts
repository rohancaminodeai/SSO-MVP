import type { KeySet } from "@sso/common";

/** A central identity row in auth_db.identities. */
export interface Identity {
  sub: string;
  email: string;
  passwordHash: string;
  name: string;
}

/**
 * The only persistence the app touches. Production uses a pg-backed implementation
 * (src/db/repo.ts); tests inject an in-memory one. This is what makes the factory testable.
 */
export interface AuthStore {
  findIdentityByEmail(email: string): Promise<Identity | null>;
  createIdentity(identity: Identity): Promise<void>;
  /** Entitlements shaped for the token: { "<tenant_id>": ["<role>", ...] }. */
  getEntitlements(sub: string): Promise<Record<string, string[]>>;
  grantEntitlement(sub: string, tenantId: string, roles: string[]): Promise<void>;
}

/** Dependencies injected into createApp — no global state, so tests inject throwaways. */
export interface AppDeps {
  store: AuthStore;
  /** Private key signs tokens; the public half is published at /.well-known/jwks.json. */
  keySet: KeySet;
  issuer: string;
  audience: string;
  /** Injectable global-id generator. Tests pin it; production uses a random one. */
  newSub?: () => string;
}
