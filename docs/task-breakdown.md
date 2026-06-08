# Task Breakdown — SSO MVP (Phases 1–3)

> Master checklist for the whole build. One row per **stage**; each stage is one full
> **SDD → TDD** cycle and **one git branch** off `develop` (`feat/NN-short-description`).
> Source of truth for scope is the plan (`~/.claude/plans/i-want-to-make-glittery-truffle.md`),
> [docs/ARCHITECTURE.md](ARCHITECTURE.md), and the per-stage [specs/](../specs/).
>
> **The one rule:** *Centralize authentication. Keep authorization local.*
>
> **Cadence per stage:** spec (`specs/NN-*.md`) → failing tests (`*.test.ts`) → minimum code →
> refactor (+ ADR if a real decision) → checkpoint (suite green + manual proof) → **PR into `develop`**
> → pause for review. Never write code before a failing test exists. One stage at a time.

## Status legend

- `[x]` done · `[~]` in progress · `[ ]` not started

## Progress at a glance

| Phase | Stages | Done |
|---|---|---|
| Phase 1 — study-guide architecture | P1.0 – P1.6 (7) | 1 / 7 |
| Phase 2 — full OIDC + browser SSO | P2.1 – P2.6 (6) | 0 / 6 |
| Phase 3 — AWS (self-host + Cognito) | P3.0 – P3.8 (9) | 0 / 9 |

---

## PHASE 1 — Study-guide architecture (covers every concept in study.html)

Simplified token model: direct `POST /login` → signed RS256 JWT carrying entitlements → tenant
resource servers verify **offline** and enforce isolation. No browser redirects yet.

### [x] P1.0 — Infra, factory scaffolding & architecture doc
- **Branch:** `feat/00-infra` · **Spec:** [specs/00-infra.md](../specs/00-infra.md)
- **Why:** clean monorepo + per-tenant DBs mirror real SSO; the factory pattern makes the security
  pipeline testable in ms; ARCHITECTURE.md is the map everything else fills in.
- **Tests (red):** config invariants (`ALG==="RS256"`, TTL 900, leeway 60, tenant ids); env loader
  parse + throw; dev defaults; DB reachability (`SELECT 1`, skips if no Postgres); `tsc --noEmit`.
- **Code:** npm workspaces, `tsconfig.base.json`, `vitest.config.ts`, `.env.example`, `.gitignore`,
  `docker-compose.yml` (Postgres + 3 DBs via `db/init/`), `packages/common/src/config.ts` (pinned consts + env loader).
- **Docs:** author [docs/ARCHITECTURE.md](ARCHITECTURE.md).
- **Checkpoint:** `docker compose up -d` brings up Postgres w/ 3 DBs; `npm test` green; ARCHITECTURE reviewed.
- **Note:** code committed (`a77b4dc` "P1.0 green"). ⏳ Remaining housekeeping: open PR `feat/00-infra` → `develop`.

### [ ] P1.1 — Keys, JWT, JWKS, config pinning
- **Branch:** `feat/01-keys-jwt` · **Spec:** `specs/01-keys-jwt.md`
- **Why:** trust = asymmetric signatures; clients verify offline; pinning defeats `alg:none`/HS256 confusion.
- **Tests (red):** sign→verify roundtrip; **tampered token rejected**; **`alg:none` rejected**;
  **HS256 rejected**; expired + 60s leeway boundary; `iss`/`aud` enforced; JWKS shape + `kid`.
- **Code:** `packages/common/src/keys.ts` (RSA keypair load/generate, build JWKS, `kid`),
  `packages/common/src/jwt.ts` (`mint()` IdP-only + `verify()` alg-pinned, iss/aud/exp/leeway).
- **What matters:** `algorithms:["RS256"]` only; private key never leaves the IdP; leeway.
- **ADRs:** [0001 RS256](adr/0001-rs256-asymmetric-signing.md), [0002 pin RS256](adr/0002-pin-rs256-alg.md) (already authored — confirm vs code).

### [ ] P1.2 — auth-service: login, signup, jwks
- **Branch:** `feat/02-auth-service` · **Spec:** `specs/02-auth-service.md`
- **Why:** the one place passwords are checked; mints entitlement-carrying tokens.
- **Tests (red):** login success mints valid JWT with entitlements; **wrong password & unknown email
  both 401 with identical timing** (dummy-hash); signup creates identity + entitlement; `/.well-known/jwks.json` serves public key.
- **Code:** `packages/common/src/password.ts` (bcrypt + `DUMMY_HASH`); `auth-service` `createApp(deps)`
  factory + `server.ts`; routes `login.ts` / `signup.ts` / `jwks.ts`; `auth_db` identities + entitlements
  tables + seed (alice→tenant_a, bob→both).
- **ADRs:** [0003 entitlements in token](adr/0003-entitlements-in-token.md), [0006 no user enumeration](adr/0006-no-user-enumeration.md).

### [ ] P1.3 — tenant-service: the 6 checks + isolation
- **Branch:** `feat/03-tenant-service` · **Spec:** `specs/03-tenant-service.md`
- **Why:** resource servers trust tokens, never passwords; isolation keeps SSO safe.
- **Tests (red):** one test per check (1–6) with correct 401/403; Flow A (200);
  **Flow B (403 not entitled, before any DB read)**; offline verify using cached JWKS.
- **Code:** `tenant-service` `createApp({tenantId, db, jwksClient})` + `server.ts`;
  `src/security/verifyToken.ts` (the 6 ordered checks); routes `me.ts` / `data.ts` / `healthz.ts`;
  `tenant_*_db` users (w/ `idp_sub`) + data_items.
- **What matters:** 401 vs 403 taxonomy; check ordering; **check #5 before any DB read**.
- **ADRs:** [0004 offline verification](adr/0004-offline-verification.md).

### [ ] P1.4 — JIT provisioning (Flow C)
- **Branch:** `feat/04-provisioning` · **Spec:** `specs/04-provisioning.md`
- **Why:** entitlement ≠ local account.
- **Tests (red):** entitled-but-unprovisioned → **403 no local user**; `POST /provision` → 200 thereafter; idempotent.
- **Code:** `tenant-service/src/routes/provision.ts`.
- **ADRs:** [0005 idp_sub link + JIT provisioning](adr/0005-idp-sub-link-and-jit-provisioning.md).

### [ ] P1.5 — One image many roles + SSO launcher UI + ADRs
- **Branch:** `feat/05-compose-ui` · **Spec:** `specs/05-compose-ui.md`
- **Why:** every tenant runs identical code; see SSO live.
- **Tests (red):** e2e against the running stack — alice 403 at App B, bob 200 at both.
- **Code:** `docker-compose.yml` runs the tenant image twice via `TENANT_ID`; `packages/web/login.html`
  (SSO login), `web/portal.html` (Open App 1 / Open App 2), App 1/App 2 home views
  (`<h1>Welcome APP1 homepage</h1>` etc.) rendered from tenant data; finalize `docs/adr/`.
- **Checkpoint:** log in once → click both buttons → land on each app's home page.
- **ADRs:** [0007 one image many roles](adr/0007-one-image-many-roles.md).

### [ ] P1.6 — Idempotent migration
- **Branch:** `feat/06-migration` · **Spec:** `specs/06-migration.md`
- **Why:** move existing local users to central login, zero downtime, restartable.
- **Tests (red):** run twice → no duplicates; links by email; stamps `idp_sub`; resumable one tenant at a time.
- **Code:** `migrate.ts` (idempotent, restartable).
- **ADRs:** [0008 idempotent migration](adr/0008-idempotent-migration.md).

**Phase 1 exit:** Flows A/B/C demonstrable via curl + UI; `npm test` green. Merge `develop` → `main` at phase boundary.

---

## PHASE 2 — Full OIDC + real browser SSO (the guide's "next step")

Add the authorization-code redirect dance, PKCE, consent, discovery, refresh rotation, and a shared
server-side IdP session. Phase 1 tenant resource servers are reused as the APIs clients call with the
access token. New `auth_db` tables: `sessions`, `authorization_codes`, `refresh_tokens`, `clients`, `consents`.

### [ ] P2.1 — IdP session + redirectable login page
- **Branch:** `feat/21-idp-session` · **Spec:** `specs/21-idp-session.md`
- **Why:** SSO needs one shared server-side session.
- **Tests (red):** login sets signed httpOnly cookie → `sessions` row; logout clears it.
- **What matters:** httpOnly + SameSite + signed; server-side so logout is real.

### [ ] P2.2 — `/authorize` + consent + discovery
- **Branch:** `feat/22-authorize-consent` · **Spec:** `specs/22-authorize.md`
- **Why:** front-channel entry; validate client and branch to login/consent.
- **Tests (red):** valid req → code; unknown client / bad redirect_uri / missing PKCE rejected;
  persisted consent skips re-prompt; discovery doc shape.
- **What matters:** **exact redirect_uri match** (open-redirect defense); require `code_challenge`.
- **Standard:** RFC 6749, OIDC Core / Discovery.

### [ ] P2.3 — `/token` authorization_code + PKCE + id_token
- **Branch:** `feat/23-token-pkce` · **Spec:** `specs/23-token.md`
- **Why:** back-channel turns code into tokens — the security heart.
- **Tests (red):** `pkce.test.ts` (S256, wrong verifier fails); code → tokens; **code replay rejected**;
  id_token claims (`iss`/`aud`/`sub`/`nonce`/`exp`).
- **What matters:** PKCE verify; single-use + bound code; OIDC id_token.
- **Standard:** RFC 6749 §4.1, RFC 7636, OIDC Core.

### [ ] P2.4 — Refresh rotation + `/userinfo`
- **Branch:** `feat/24-refresh-userinfo` · **Spec:** `specs/24-refresh-userinfo.md`
- **Tests (red):** `/userinfo` valid/expired/invalid Bearer; refresh issues new tokens;
  **reusing a rotated refresh token revokes the lineage**.
- **What matters:** opaque hashed refresh tokens; rotation; revoke-on-reuse detection.

### [ ] P2.5 — Portal + App 1 (relying party)
- **Branch:** `feat/25-portal-app1` · **Spec:** `specs/25-portal-app1.md`
- **Why:** see the RP redirect side end-to-end with the launcher UI.
- **Tests (red):** authz URL carries `state` + `nonce` + PKCE; id_token validation rejects bad
  nonce/aud/sig; `/callback` CSRF (`state` mismatch) rejected.
- **Code:** `portal` (:9000) login + "Open App 1 / App 2" buttons; `client-web-a` (:9001) redirect →
  `/callback` → token exchange → verify id_token via JWKS → render `<h1>Welcome APP1 homepage</h1>` +
  call the tenant resource server with the access token.
- **What matters:** `state`/`nonce`; verify signature; never trust unsigned data.

### [ ] P2.6 — App 2 → browser SSO + single logout
- **Branch:** `feat/26-app2-sso-logout` · **Spec:** `specs/26-sso-logout.md`
- **Why:** prove real SSO via the portal buttons.
- **Tests (red):** `sso.test.ts` — with an IdP session, App 2's `/authorize` issues a code **with no
  login prompt**; IdP `/logout` forces both apps to re-login.
- **Code:** `client-web-b` (:9002) rendering `<h1>Welcome APP2 homepage</h1>`.
- **Checkpoint:** login on portal → Open App 1 → back to portal → Open App 2 lands signed-in with no
  prompt → logout → both prompt. README walkthrough.

**Phase 2 exit:** browser SSO + single logout demonstrable; code-replay & refresh-reuse rejected; id_token verifies. Merge `develop` → `main`.

---

## PHASE 3 — Real-world on AWS (deep AWS infra + SSO)

Self-host the IdP + apps on AWS first (exercises full VPC/ALB/RDS/key management + your SSO
internals), then a Cognito comparison capstone. **App code is unchanged** — only `ISSUER`/`AUDIENCE`/
JWKS URL move (already env-driven). Full design in [docs/PHASE3-AWS.md](PHASE3-AWS.md).

**Infra-adapted method per stage:** short infra spec/ADR → **build by hand in the AWS Console** →
**verify** Flows A/B/C over HTTPS → **codify as AWS CDK (TypeScript)** in `infra/` → `cdk destroy` to
avoid idle cost. New top-level `infra/` CDK app + `infra/verify.ts` (e2e HTTPS smoke test).

### Self-hosted (3a)

### [ ] P3.0 — Account prep & CDK scaffold
- **Spec:** `specs/30-aws-foundation.md`
- Billing alarm; IAM admin via IAM Identity Center; pick region; Route 53 hosted zone; **ACM** cert
  for `*.<domain>`; bootstrap `infra/` CDK app.
- **Verify:** `cdk synth` works; cert issued; billing alarm armed.

### [ ] P3.1 — Networking (VPC)
- **Spec:** `specs/31-network.md`
- Console-build VPC: 2 public + 2 private subnets across 2 AZs, IGW, NAT, route tables,
  deny-by-default security groups → codify `NetworkStack`.
- **Verify:** topology + SG rules correct. **ADR:** "VPC public/private layout".

### [ ] P3.2 — Data (RDS PostgreSQL)
- **Spec:** `specs/32-data.md`
- RDS in private subnets (not public, encrypted at rest); create `auth_db`/`tenant_a_db`/`tenant_b_db`;
  creds in **Secrets Manager** → codify `DataStack`.
- **Verify:** `SELECT 1` on each DB via SSM session. **ADR:** "managed RDS, private + encrypted".

### [ ] P3.3 — IdP on EC2 behind ALB + HTTPS
- **Spec:** `specs/33-idp.md`
- Push IdP image to **ECR**; EC2/ASG in private subnet; **ALB** in public subnets, HTTPS:443 (ACM) +
  host rule `auth.<domain>`; IAM role so **only the IdP can read the signing-key secret** → codify `IdpStack`.
- **Verify:** `curl https://auth.<domain>/.well-known/jwks.json`. **ADR:** "ALB terminates TLS".

### [ ] P3.4 — APP1 + APP2 on EC2 (one image, two `TENANT_ID`s) behind ALB
- **Spec:** `specs/34-apps.md`
- Host rules `app1./app2.<domain>` → codify `AppsStack`.
- **Verify (the payoff):** reproduce **Flows A/B/C over HTTPS** — login → app1 200; tenant_a-only user
  → app2 403; new user → provision → 200. **ADR:** "one image many roles on AWS".

### [ ] P3.5 — Key hardening: Secrets Manager → KMS signing
- **Spec:** `specs/35-kms-signing.md`
- Move the private key into an **asymmetric KMS key**; the IdP calls **KMS to sign** so the key
  *never leaves AWS*; JWKS publishes the KMS public key → codify `KmsSigningStack`.
- **Verify:** tokens still verify end-to-end; raw private key not retrievable. **ADR:** "sign with KMS, never export the key".

### [ ] P3.6 — Observability & teardown discipline
- **Spec:** `specs/36-observability.md`
- CloudWatch logs/metrics; ALB access logs → S3; document `cdk destroy` runbook; cost review.
- **Verify:** logs visible; `cdk destroy` leaves nothing billable. **ADR:** "destroy when idle".

### Managed capstone (3b — Cognito)

### [ ] P3.7 — Cognito User Pool
- **Spec:** `specs/37-cognito-pool.md`
- App clients for app1/app2 (Hosted UI, authz-code + PKCE); **Groups** `tenant_a`/`tenant_b` =
  entitlements; a **Pre-Token-Generation Lambda** injects an `entitlements` claim matching the
  Phase-1 shape → codify `CognitoStack`. **ADR:** "Cognito groups as entitlements".

### [ ] P3.8 — Repoint apps at Cognito & compare
- **Spec:** `specs/38-cognito-compare.md`
- Switch each app's verifier to Cognito's issuer + JWKS (config only, no code change); reproduce
  **Flows A/B/C** with a managed IdP. *Optional:* ALB `authenticate-oidc` offload. **ADR:** "managed vs
  self-hosted IdP trade-off".
- **Checkpoint:** same SSO behavior, AWS-managed keys + login UI.

---

## Cross-cutting deliverables (keep current every stage)

- [ ] [docs/ARCHITECTURE.md](ARCHITECTURE.md) — updated at each stage's refactor step (never drifts).
- [ ] [docs/adr/](adr/) — one ADR per real decision (0001–0008 authored; add Phase 2/3 ADRs as they arise).
- [x] [docs/PHASE3-AWS.md](PHASE3-AWS.md) — authored.
- [ ] [README.md](../README.md) — quickstart + end-to-end SSO walkthrough (run, log in, launch App 1/App 2).
- [ ] `specs/` — one SDD spec per stage, written **before** code.

## Out of scope (study MVP)

Email verification, password reset, MFA, admin UI for client registration, token introspection/
revocation endpoints, multi-region, full prod HTTPS hardening. (Natural follow-on exercises.)
