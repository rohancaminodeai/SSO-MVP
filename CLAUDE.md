# CLAUDE.md — SSO MVP (Single Point of Authentication)

Guidance for working in this repository. Read this before making changes.

## What this project is

A **study project** to understand Single Sign-On (SSO) from the inside by building it in
**Node.js + TypeScript**. It is anchored to the concepts in `study.html` (the study guide) and must
teach **all** of them. Every step is explained: *why* it is required, *how* it is coded, *what*
matters (the security pitfalls).

It is built in **two phases**:

- **Phase 1 — the study-guide architecture.** A deliberately simplified SSO design: a central
  Identity Provider (IdP) checks passwords and mints a signed JWT carrying *entitlements*; multiple
  tenant resource servers verify that token **offline** and enforce isolation. No browser redirects.
- **Phase 2 — full OIDC.** Evolve the IdP into a real OAuth 2.0 / OpenID Connect Authorization
  Server: `/authorize` + `/token` redirect flow, PKCE, refresh tokens with rotation, consent,
  discovery, a shared server-side IdP session (real browser SSO), and single logout.

The full plan lives at `~/.claude/plans/i-want-to-make-glittery-truffle.md`. The overall architecture
is in `docs/ARCHITECTURE.md`. Decisions are recorded as ADRs in `docs/adr/`.

## The one rule (memorize it)

> **Centralize authentication. Keep authorization local.**

- **Authentication** ("who are you?") happens in exactly one place: the IdP (`auth-service`). It is
  the *only* service that ever sees a password.
- **Authorization** ("what may you do here?") is decided by each tenant against its own data.

## Methodology — SDD + TDD (non-negotiable)

Work **one stage at a time**. For each stage follow this exact cycle:

1. **Spec first (SDD)** — write/۰update `specs/NN-*.md` *before any code*: the contract (inputs,
   outputs, error cases), an acceptance-criteria checklist, and the standard it implements
   (RFC 6749 / RFC 7636 / OIDC Core / the study guide's rules). The spec is the source of truth.
2. **Test first (TDD red)** — translate the acceptance criteria into failing `*.test.ts`. Watch
   them fail. **Never write implementation before a failing test exists.**
3. **Implement (TDD green)** — the minimum code to make the tests pass.
4. **Refactor** — clean up with tests green. If a real decision was made, add an ADR.
5. **Checkpoint** — full stage suite green + a manual proof (curl/UI). **Then pause for review
   before starting the next stage.** Do not run ahead through multiple stages.

`npm test` (vitest + supertest) is the primary gate. Green suite = spec satisfied.

## Git workflow (non-negotiable — every session MUST follow this)

Remote: `https://github.com/rohancaminodeai/SSO-MVP`.

- **`main`** is the default, protected line. Never commit directly to `main`.
- **`develop`** is the integration branch. All feature work branches off `develop`.
- **For each task/stage in the phases, create a NEW branch off `develop`** before writing any
  code. One branch per stage — do not reuse a branch across stages.
  - Naming: `feat/NN-short-description` (e.g. `feat/01-jwks-endpoint`), matching the `specs/NN-*.md`
    the stage implements. Use `fix/…`, `docs/…`, `chore/…` for non-feature work.
  - Start from up-to-date develop:
    ```bash
    git checkout develop && git pull
    git checkout -b feat/NN-short-description
    ```
  - When the stage checkpoint is green (suite passes + manual proof), open a PR into `develop`,
    not `main`. `develop` merges to `main` only at phase boundaries.
- Commit at the SDD→TDD rhythm (spec, failing tests, implementation, refactor) so history reads
  as the methodology.

## Architecture at a glance

```
auth-service (IdP, :8000)  --signed JWT (RS256, carries entitlements)-->  client
   |  GET /.well-known/jwks.json (public keys; tenants cache & verify OFFLINE)
tenant-service A (:8001)  +  tenant-service B (:8002)   <-- same image, different TENANT_ID
Postgres: auth_db (identities, entitlements) | tenant_a_db | tenant_b_db (users w/ idp_sub, data_items)
Phase 2 adds: portal (:9000), client-web-a (:9001), client-web-b (:9002)
```

### The 6 ordered security checks (tenant-service)
Every tenant request runs these **in order**; the first failure decides the status. **Check #5 runs
before any DB read** (the isolation invariant).
1. `Authorization: Bearer <token>` present → else **401**
2. Signature valid **and `alg=RS256` pinned** → else **401**
3. Not expired (±60s leeway) → else **401**
4. Correct `iss` + `aud` → else **401**
5. `entitlements` names **this** tenant → else **403** (before any DB read)
6. `sub` matches a local `users` row here → else **403**
→ all pass → **200**

**401 = "I don't know who you are" (authn). 403 = "I know you, but you can't be here" (authz).**

## Conventions

- **Language:** TypeScript, ES modules. Run with `tsx` in dev.
- **HTTP:** `express`. **Validation:** `zod` at the edge of every route.
- **Crypto/JWT:** `jose` (RS256, JWKS, id_tokens). **Passwords:** `bcrypt` + a constant
  `DUMMY_HASH` so unknown-email and wrong-password fail identically (no user enumeration).
- **DB:** `pg`. Each service owns its **own database** (`auth_db`, `tenant_a_db`, `tenant_b_db`).
  A tenant never reads another tenant's data.
- **Factory pattern:** every service exposes `createApp(deps)` taking its DB + keys as arguments, so
  tests inject a throwaway DB and an ephemeral keypair. Production wiring lives in `server.ts`.
- **Pinned constants** live in `packages/common/src/config.ts` (issuer, audience, `alg=RS256`,
  15-min token TTL, 60-second leeway). Do not hardcode these elsewhere.
- **`alg` pinning is sacred:** verification must use `algorithms: ["RS256"]` only. Never accept
  `none` or HS256. This defeats `alg:none` and key-confusion attacks.
- **Private key never leaves the IdP.** Tenants get only the public key (via JWKS).

## Layout

```
packages/common/        shared core: config, keys (JWKS), jwt (mint/verify), password
packages/auth-service/  the IdP (:8000) — login, signup, jwks (+ Phase 2 OIDC endpoints)
packages/tenant-service/ resource server, run twice via TENANT_ID — the 6 checks live here
packages/web/           Phase 1 UI: login + portal (Open App 1 / App 2) + app home pages
packages/portal,client-web-a,client-web-b/  Phase 2 browser apps
specs/                  SDD specs (one per stage)
docs/ARCHITECTURE.md    overall architecture (keep current)
docs/adr/               one ADR per decision
migrate.ts              idempotent, restartable migration
```

## Common commands

```bash
npm install
docker compose up -d         # postgres + services
npm test                     # vitest unit + supertest integration (primary gate)
npm run dev                  # run services locally with tsx
```

## When editing

- Keep `docs/ARCHITECTURE.md` and the relevant `specs/NN-*.md` in sync with code changes.
- New decision? Add an ADR (`docs/adr/NNNN-title.md`: decision · why · trade-off).
- Stay inside the current stage. Finish its SDD→TDD cycle and pause before the next.

## After every task is done (required deliverables)

When a stage's checkpoint is green, **before pausing for review**, always produce two artifacts:

1. **Summary note** — `docs/summaries/<task>.md` (named after the stage, e.g. `P1.0-infra.md`).
   A short markdown summary covering: what we added/changed · the feature · why it matters ·
   how to test locally · the **top 3–5 must-know concepts** · technical decisions (ADRs).
2. **Study material** — `docs/study_materials/<task>.html`. Build it by **copying the skeleton
   [`docs/study_materials/_template.html`](docs/study_materials/_template.html)** and filling every
   section — do **not** invent your own structure. The template (and its top authoring-guide comment)
   is the spec; the root `study.html` is the gold-standard reference and
   [`docs/study_materials/P1.0-infra.html`](docs/study_materials/P1.0-infra.html) is the worked example.
   - **Write in simple English** so it can teach other engineers: short sentences, active voice,
     define every acronym on first use, concrete example before the abstract rule.
   - Follow the four-part pattern: **Explain → Example → Reflect → Practice** (the template's 9
     sections), and use its teaching devices (analogy per hard concept, why-box per decision,
     warn-box per pitfall, worked code with comments, glossary, collapsible self-quiz).
   - The **top 3–5 must-know concepts** each get a card: definition → why → analogy → pitfall (+ADR).

One file each per task. Do not skip these — they are part of the stage's definition of done.
