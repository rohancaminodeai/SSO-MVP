# Architecture — SSO MVP (Single Point of Authentication)

> Status: living document. Authored in stage P1.0; updated at every stage's refactor step so it never
> drifts from the code. Decisions referenced here are recorded in [`adr/`](./adr/).

## 1. Purpose & the one rule

This project builds a working **Single Sign-On (SSO)** system to learn how SSO works end to end.
Everything follows one rule:

> **Centralize authentication. Keep authorization local.**

- **Authentication** ("who are you?") — done in one place, the **Identity Provider (IdP)**. It is the
  only service that ever checks a password.
- **Authorization** ("what may you do here?") — decided by **each tenant**, on its own, against its
  own database. A tenant never checks passwords; it only checks *permission*.

**SSO** is the user experience that results: log in once, then reach every app you're allowed to,
without logging in again — while no app can read another app's data.

## 2. System overview

The system grows in two phases. The trust model is identical in both; Phase 2 only adds the browser
redirect machinery that production OIDC uses.

### Phase 1 — simplified token model (study-guide architecture)

```
                 POST /login   (the ONLY place passwords are checked)
   client  ─────────────────►  auth-service (IdP) :8000
   client  ◄─── signed JWT ───  (RS256; the token carries `entitlements`)
                                 │ GET /.well-known/jwks.json  (public keys)
                                 ▼  tenants fetch ONCE, cache, and verify OFFLINE
   client --Authorization: Bearer <JWT>-->  tenant-service A :8001   → 200 if entitled + provisioned
                                       └-->  tenant-service B :8002   → 403 if token omits this tenant

   Postgres
     auth_db      : identities (humans + password hashes), entitlements (who may enter which tenant)
     tenant_a_db  : users (linked via idp_sub), data_items      ← Tenant A owns its data
     tenant_b_db  : users (linked via idp_sub), data_items      ← Tenant B owns its data
```

### Phase 2 — full OIDC + real browser SSO

```
   browser ─► portal :9000 ─"Open App 1"─► client-web-a :9001 ─redirect─► auth-service /authorize
                                                                              │ (no IdP session?) → /login
   browser ◄──────────────── IdP session cookie (httpOnly, on :8000) ────────┘  → /consent → code
   client-web-a  ── POST /token (code + PKCE) ─►  auth-service   ◄── id_token + access + refresh
   client-web-a  ── Bearer access token ─────►  tenant-service (reused from Phase 1)
   browser ─► portal ─"Open App 2"─► client-web-b :9002 ─► /authorize → IdP session ALREADY set
                                                            → straight back with a code = SSO
```

**Trust boundaries:** the private signing key lives only inside `auth-service`. Every other service
holds only the public key (via JWKS) — enough to *verify* a token, never to *forge* one. Each tenant
DB is isolated; cross-tenant reads are impossible by construction (separate databases + check #5).

## 3. Components

| Component | Port | Responsibility | Owns |
|---|---|---|---|
| **auth-service** (IdP) | 8000 | The only password checker. Mints + signs JWTs. Publishes JWKS. (Phase 2: full OIDC endpoints + IdP session.) | `auth_db`: identities, entitlements (Phase 2: sessions, clients, codes, refresh_tokens, consents) |
| **tenant-service** ×2 | 8001 / 8002 | Resource server. Verifies tokens offline, runs the 6 checks, serves its own data. Never sees passwords. Same image, different `TENANT_ID`. | `tenant_*_db`: users (w/ `idp_sub`), data_items |
| **common** (library) | — | Security-critical shared core: `config` (pinned constants), `keys` (JWKS), `jwt` (`mint`/`verify`), `password` (bcrypt + dummy hash). | — |
| **web** | static | Phase 1 UI: login page + portal (Open App 1/App 2) + app home pages. | — |
| **portal / client-web-a / client-web-b** | 9000 / 9001 / 9002 | Phase 2 browser apps. Portal = login + launcher buttons; the two apps are OIDC relying parties with home pages. | — |

**One image, many roles:** there is one tenant image. `docker-compose.yml` runs it twice, passing a
different `TENANT_ID` and database URL — exactly like real life, where every tenant runs identical
code pointed at its own data. See [ADR-0007](./adr/0007-one-image-many-roles.md).

## 4. Data model

**Phase 1**
- `auth_db.identities` — `sub` (pk, global user id), `email` (unique), `password_hash`, `name`, `created_at`
- `auth_db.entitlements` — `(sub, tenant_id)` pk, `roles text[]` — who may enter which tenant
  (granted at signup with a default of `tenant_a:[member]`, see [ADR-0009](./adr/0009-signup-default-entitlement.md))
- `tenant_*_db.users` — `id` (pk), `idp_sub` (unique link to the global `sub`), `display_name`, roles, `created_at`
- `tenant_*_db.data_items` — `id`, `owner_idp_sub`, payload — the tenant's own data

**Phase 2 (added to `auth_db`)**
- `sessions` — `id` (pk), `sub`, `expires_at` — the server-side IdP SSO session (cookie-referenced)
- `authorization_codes` — single-use, ~60s, bound to client + redirect_uri + PKCE challenge + nonce
- `refresh_tokens` — stored hashed, revocable, with rotation lineage (`rotated_to`)
- `clients` — `client_id`, `redirect_uris[]`, `is_public`, allowed scopes
- `consents` — `(sub, client_id)` → granted scopes

`idp_sub` is the seam between the global identity and a tenant's local account: the IdP owns *who you
are*; the tenant owns *your account here*. See [ADR-0005](./adr/0005-idp-sub-link-and-jit-provisioning.md).

## 5. Token & trust model

- **JWT** = `header.payload.signature`. Payload claims: `iss`, `aud`, `sub`, `exp`, `iat`, `email`,
  and `entitlements` (e.g. `{ "tenant_a": ["member"] }`).
- **RS256 (asymmetric).** The IdP signs with a **private key** it alone holds; anyone verifies with
  the **public key**. A compromised tenant can verify but never forge. See
  [ADR-0001](./adr/0001-rs256-asymmetric-signing.md).
- **JWKS** — public keys published at `/.well-known/jwks.json`. Tenants fetch once and **cache**.
  The token header's `kid` selects the key, enabling rotation later.
- **`alg` pinning** — verification accepts `algorithms: ["RS256"]` *only*, killing `alg:none` and
  HS256 key-confusion attacks. See [ADR-0002](./adr/0002-pin-rs256-alg.md).
- **Entitlements in the token** — authorization data travels inside the signed token, so tenants
  authorize **offline** without calling the IdP per request. See
  [ADR-0003](./adr/0003-entitlements-in-token.md) and [ADR-0004](./adr/0004-offline-verification.md).
- **Short life + leeway** — 15-minute token TTL limits theft damage; ±60s clock leeway tolerates
  small clock skew. Constants are pinned in `common/config.ts`.

## 6. Request lifecycle — the 6 ordered security checks

Every tenant request runs these in order; the **first** failure decides the status code.
**Check #5 runs before any database read** — the isolation invariant.

| # | Check | On failure |
|---|---|---|
| 1 | `Authorization: Bearer <token>` present | 401 missing token |
| 2 | Signature valid **and `alg=RS256`** | 401 invalid token |
| 3 | Not expired (±60s leeway) | 401 token expired |
| 4 | Correct `iss` and `aud` | 401 invalid token |
| 5 | `entitlements` names **this** tenant | **403 not entitled** (before any DB read) |
| 6 | `sub` matches a local `users` row | 403 no local user |
| ✓ | all pass | 200 + this tenant's data |

**401 vs 403:** 401 = authentication failed ("I don't know who you are"). 403 = authorization failed
("I know who you are, but you may not be here").

## 7. Flows

- **Flow A — happy path / SSO.** Login → token → Tenant A `/me` returns 200 → present the *same*
  token to Tenant B (no second login).
- **Flow B — isolation.** Alice is entitled to `tenant_a` only. Her valid token at Tenant B fails
  check #5 → **403 not entitled**, before any query runs.
- **Flow C — provisioning.** A new entitled user has no local row at Tenant A yet → check #6 → **403
  no local user** → `POST /provision` creates the row → subsequent calls return 200. *Being entitled
  ≠ having an account here.* See [ADR-0005](./adr/0005-idp-sub-link-and-jit-provisioning.md).
- **Phase 2 — browser SSO.** First app triggers a redirect login; the IdP sets a server-side session
  cookie. The second app's `/authorize` finds that session and returns a code with no login prompt.
  IdP `/logout` ends the session → both apps require login again (single logout).

## 8. Key decisions (see `adr/`)

- [0001](./adr/0001-rs256-asymmetric-signing.md) — RS256 asymmetric signing (not a shared secret).
- [0002](./adr/0002-pin-rs256-alg.md) — Pin `alg=RS256` on verification.
- [0003](./adr/0003-entitlements-in-token.md) — Carry entitlements inside the token.
- [0004](./adr/0004-offline-verification.md) — Tenants verify offline (IdP-down resilience).
- [0005](./adr/0005-idp-sub-link-and-jit-provisioning.md) — `idp_sub` link + JIT provisioning.
- [0006](./adr/0006-no-user-enumeration.md) — Constant-time login (no user enumeration).
- [0007](./adr/0007-one-image-many-roles.md) — One image, many roles.
- [0008](./adr/0008-idempotent-migration.md) — Idempotent, restartable migration.
- [0009](./adr/0009-signup-default-entitlement.md) — Signup grants a default entitlement (`tenant_a:[member]`).

## 9. Phase roadmap

| | Phase 1 (study-guide model) | Phase 2 (full OIDC) |
|---|---|---|
| Login | direct `POST /login` → JWT | browser redirect: `/authorize` → `/token` |
| Authz | entitlements in token, offline | scopes + consent |
| Tokens | access JWT only | id_token + access + **refresh (rotated)** |
| Security | RS256, pinning, isolation, no-enumeration | + PKCE, `state`, `nonce`, redirect_uri allowlist |
| SSO felt via | same token at both tenants | shared IdP session cookie + single logout |
| UI | static login + portal + app pages | portal + two real RP web apps |

**Phase 3 (optional, real-world AWS)** — deploy the system on AWS: first self-hosted (EC2/ECS + ALB +
ACM/TLS + RDS + Secrets Manager/KMS for the private key), then swap the IdP for managed **Amazon
Cognito** (groups → entitlements via a Pre-Token-Generation Lambda). The app verification logic is
unchanged — only the issuer + JWKS URL move. See [PHASE3-AWS.md](./PHASE3-AWS.md).

See the full staged plan at `~/.claude/plans/i-want-to-make-glittery-truffle.md`.
