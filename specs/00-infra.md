# Spec 00 — Infrastructure & foundation (Stage P1.0)

> SDD: this spec is the contract for stage P1.0. Tests are written against the acceptance criteria
> below *before* implementation. See the methodology in [CLAUDE.md](../CLAUDE.md).

## Goal

Stand up the project skeleton: a TypeScript npm-workspaces monorepo, a Postgres instance with the
three per-service databases, the pinned shared constants, and the test harness — so later stages can
focus purely on SSO logic. Also author the overall architecture doc.

## Why this stage exists

A clean structure + per-tenant databases mirror how real SSO systems are organized, and the
**factory pattern** (`createApp(deps)`) is what makes the security pipeline testable in milliseconds.
Getting the foundation right means every later stage is a small, well-isolated SDD→TDD cycle.

## Deliverables

- `package.json` (npm workspaces: `packages/*`), `tsconfig.base.json`, `vitest.config.ts`,
  `.env.example`, `.gitignore`.
- `docker-compose.yml` — Postgres service; init creates `auth_db`, `tenant_a_db`, `tenant_b_db`.
- `db/init/01-create-databases.sql` — the three databases.
- `packages/common/src/config.ts` — pinned constants (see below) + an env loader.
- `docs/ARCHITECTURE.md` — authored this stage (done).

## The pinned constants (`packages/common/src/config.ts`)

These are the single source of truth; nothing elsewhere may hardcode them.

| Constant | Value | Why |
|---|---|---|
| `ALG` | `"RS256"` | Asymmetric signing; pinned on verify (ADR-0001, ADR-0002) |
| `ISSUER` | `http://localhost:8000` (env `ISSUER`) | `iss` claim; checked by tenants |
| `AUDIENCE` | `platform-tenants` (env `AUDIENCE`) | `aud` claim; checked by tenants |
| `ACCESS_TOKEN_TTL_SECONDS` | `900` (15 min) | Short life limits theft damage |
| `CLOCK_LEEWAY_SECONDS` | `60` | Tolerate small clock skew |
| `TENANT_IDS` | `["tenant_a", "tenant_b"]` | Known tenants |

`config.ts` also exposes a typed env reader returning `{ databaseUrl, issuer, audience, tenantId? }`
with sensible defaults for local dev, throwing on malformed values.

## Acceptance criteria (→ become the failing tests first)

1. **Config invariants** — `ALG === "RS256"`, `ACCESS_TOKEN_TTL_SECONDS === 900`,
   `CLOCK_LEEWAY_SECONDS === 60`, `TENANT_IDS` contains `tenant_a` and `tenant_b`.
2. **Env loader** — given a valid `DATABASE_URL`/`ISSUER`/`AUDIENCE`, returns the parsed config;
   given a missing required value in the "require" mode, throws a clear error.
3. **Defaults** — with no env set, dev defaults are returned (issuer `http://localhost:8000`,
   audience `platform-tenants`).
4. **DB reachability (integration, skipped if Postgres not running)** — connecting to each of
   `auth_db`, `tenant_a_db`, `tenant_b_db` succeeds (`SELECT 1`).
5. **Workspace builds** — `tsc --noEmit` passes for `packages/common`.

## Out of scope (later stages)

Keys/JWT (`P1.1`), service `createApp` factories and routes (`P1.2`+), schemas for identities /
entitlements / users / data_items (created in their owning service's stage).

## Checkpoint

`docker compose up -d` brings up Postgres with three databases; `npm test` runs the config unit
tests green (DB integration test passes when Postgres is up, skips otherwise); `docs/ARCHITECTURE.md`
reviewed. **Then pause for review before P1.1.**
