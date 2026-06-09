# Spec 02 — auth-service: login, signup, JWKS (Stage P1.2)

> SDD contract for stage P1.2. Tests are written against the acceptance criteria *before* the
> implementation. See methodology in [CLAUDE.md](../CLAUDE.md). Builds on the crypto core from
> [spec 01](./01-keys-jwt.md). Decisions: ADR-0003 (entitlements in token), ADR-0006 (no user
> enumeration), ADR-0009 (signup default entitlement — new).

## Goal

Stand up the **Identity Provider (IdP)** — `packages/auth-service` (:8000). It is the **only** service
that ever sees a password. It:

- `POST /login` — checks a password and **mints** an entitlement-carrying RS256 JWT.
- `POST /signup` — creates a new central identity (+ a default entitlement).
- `GET /.well-known/jwks.json` — serves the **public** verification key over HTTP.

Plus the shared primitive this stage needs: `packages/common/src/password.ts` (bcrypt + `DUMMY_HASH`).

## Why this stage exists

This is the heart of *"centralize authentication."* Passwords live in exactly one place. The IdP
decides a user's entitlements **once, at login**, and bakes them into a signed token (ADR-0003) so
tenants can authorize **offline** later. A naive login endpoint leaks which emails are registered
through differing responses or **timing** (bcrypt runs only when the email exists) — so login is made
constant-time and constant-response (ADR-0006). JWKS, kept in-process in P1.1, is now published over
HTTP so tenants can fetch and cache the public key.

## Libraries

- `bcrypt` (per CLAUDE.md) — password hashing + constant-time compare.
- `express` + `zod` — HTTP + edge validation.
- `@sso/common` — `mint`, `buildJwks`, `generateKeySet`/`keySetFromPem`, pinned config.
- Tests: `supertest` + `vitest`.

## Data model (`auth_db`)

```
identities    sub (pk, global id)        e.g. "u_alice"
              email (unique, citext-ish, lowercased on write)
              password_hash              bcrypt hash
              name
              created_at

entitlements  (sub, tenant_id) pk        fk sub → identities.sub
              roles text[]               e.g. {member}
```

`sub` is the **global** user id minted at signup (`u_` + random). Entitlements are the central grant
of *who may enter which tenant* — read at login and embedded in the token as
`{ "<tenant_id>": ["<role>", ...] }`.

**Seed** (dev/integration): `alice` → `tenant_a:[member]`; `bob` → `tenant_a:[member]`, `tenant_b:[member]`.
Both with a known password (`password123`). This sets up Flow A (bob 200 at both) and Flow B (alice
403 at tenant B) in P1.3.

## Architecture — factory pattern

`createApp(deps)` returns an Express app with **no** global state, so tests inject a throwaway store
and an ephemeral keypair (no Postgres, no PEM files). Production wiring lives in `server.ts`.

```ts
interface Identity { sub: string; email: string; passwordHash: string; name: string }

// The only persistence the app touches. pg-backed in prod; in-memory in tests.
interface AuthStore {
  findIdentityByEmail(email: string): Promise<Identity | null>;
  createIdentity(i: Identity): Promise<void>;
  getEntitlements(sub: string): Promise<Record<string, string[]>>;
  grantEntitlement(sub: string, tenantId: string, roles: string[]): Promise<void>;
}

interface AppDeps {
  store: AuthStore;
  keySet: KeySet;              // private key signs; public half is published at /jwks
  issuer: string;              // from loadConfig()
  audience: string;
  newSub?: () => string;       // injectable id generator (tests pin it; prod = random)
}

function createApp(deps: AppDeps): express.Express;
```

## API contract

### `POST /login`
- **Request** (JSON): `{ email: string (email), password: string (min 1) }`. Malformed → **400**
  `{ error: "invalid_request" }` (zod at the edge, before any DB/crypto work).
- **Success → 200**:
  ```json
  { "access_token": "<jwt>", "token_type": "Bearer", "expires_in": 900 }
  ```
  The JWT (via `common.mint`) carries `iss`, `aud`, `sub`, `email`, `entitlements`, `iat`, `exp`
  (TTL 900s), header `{ alg:"RS256", kid }`.
- **Failure → 401** `{ error: "invalid_credentials" }` for **both** unknown email and wrong password —
  identical body, identical status, and **constant time** (ADR-0006): on unknown email still run one
  bcrypt compare against `DUMMY_HASH` before returning.

### `POST /signup`
- **Request** (JSON): `{ email, password (min 8), name (min 1) }`. Malformed → **400** `invalid_request`.
- **Behavior**: lowercase email; if an identity with that email exists → **409** `{ error: "email_taken" }`;
  else mint a new `sub`, hash the password, `createIdentity`, and grant the **default entitlement**
  `tenant_a:[member]` (ADR-0009).
- **Success → 201**: `{ "sub": "<new sub>", "email": "<email>" }`. No token is issued — the user logs
  in separately. (The signed-up user is now *entitled* to tenant_a but has **no local users row**
  there — this is exactly the precondition for Flow C / JIT provisioning in P1.4.)

### `GET /.well-known/jwks.json`
- **Success → 200**: `await buildJwks(keySet)` → `{ keys: [ { kty:"RSA", use:"sig", alg:"RS256", kid, n, e } ] }`.
- **Public only**: never contains `d/p/q/dp/dq/qi`.
- Sends `Cache-Control: public, max-age=300` (tenants cache; rotation-friendly via `kid`).

## Acceptance criteria (→ failing tests first)

**password.ts (common)**
1. `hashPassword(pw)` then `verifyPassword(pw, hash)` → `true`; wrong password → `false`.
2. `DUMMY_HASH` is a valid bcrypt hash and `verifyPassword("anything", DUMMY_HASH)` → `false`.

**POST /login**
3. Valid credentials → **200** with `token_type:"Bearer"`, `expires_in:900`, and an `access_token`
   that `common.verify` accepts (correct `iss`/`aud`), exposing the right `sub`, `email`, and
   `entitlements` (e.g. bob → both tenants).
4. Wrong password → **401** `{ error:"invalid_credentials" }`.
5. Unknown email → **401** `{ error:"invalid_credentials" }` — **byte-identical** to criterion 4.
6. Unknown email still performs a bcrypt comparison (no-enumeration): asserted by spying that the
   verify path runs for the unknown-email case (no early return before the hash compare).
7. Missing/malformed body → **400** `{ error:"invalid_request" }`, and **no** token minted.

**POST /signup**
8. New email → **201** `{ sub, email }`; afterwards the identity is findable and has the default
   `tenant_a:[member]` entitlement; logging in then returns a token carrying that entitlement.
9. Duplicate email (case-insensitive) → **409** `{ error:"email_taken" }`.
10. Password shorter than 8 chars → **400** `invalid_request`.

**GET /.well-known/jwks.json**
11. **200** with exactly one key: `kty:"RSA"`, `use:"sig"`, `alg:"RS256"`, `kid === keySet.kid`.
12. Response contains **no** private fields (`d/p/q/dp/dq/qi`).
13. A token minted by the IdP verifies against the key served by this endpoint (import the JWKS key,
    `common.verify` succeeds) — proves the published key matches the signing key.

## Out of scope (later stages)

Tenant-side offline verification + remote JWKS caching (`createRemoteJWKSet`, P1.3); the 6 checks and
401/403 enforcement (P1.3); JIT provisioning endpoint (P1.4); browser/redirect flows, sessions,
refresh (Phase 2); admin UI to grant entitlements.

## Checkpoint

`npm test` green for criteria 1–13. Manual proof: `docker compose up -d`, run `server.ts`, then
`curl :8000/.well-known/jwks.json`, `curl -X POST :8000/login -d '{"email":"bob@example.com","password":"password123"}'`
→ a JWT; decode it by eye (claims + `entitlements`). Produce the required summary + study-material
docs. Then pause for review.
