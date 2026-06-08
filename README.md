# SSO MVP — Single Point of Authentication

A hands-on study project for understanding **Single Sign-On (SSO)** by building it in
**Node.js + TypeScript**. Built in two phases, test-first, with every decision documented.

> **The one rule:** centralize **authentication** (one IdP checks passwords), keep **authorization**
> local (each app decides what you may do).

## Documentation

- **[CLAUDE.md](./CLAUDE.md)** — how this project is built (methodology, conventions, the 6 checks).
- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — the overall architecture.
- **[docs/adr/](./docs/adr/)** — Architecture Decision Records (why each choice was made).
- **[specs/](./specs/)** — per-stage specs (the contracts the tests enforce).
- Background reading: `study.html` (the concept guide this project is anchored to).

## Methodology

**Spec-Driven + Test-Driven**, one stage at a time:
`spec → failing tests → implement → refactor → checkpoint`. `npm test` is the primary gate.

## Two-phase plan

- **Phase 1** — simplified token model: IdP mints a signed JWT carrying entitlements; tenant resource
  servers verify it offline and enforce isolation. Covers all concepts in `study.html`.
- **Phase 2** — full OIDC: `/authorize` + `/token` redirect flow, PKCE, refresh-token rotation,
  consent, discovery, real browser SSO via a shared IdP session, single logout.

## Quickstart (filled in as stages land)

```bash
npm install
docker compose up -d     # Postgres (auth_db, tenant_a_db, tenant_b_db) + services
npm test                 # run the test suite
npm run dev              # run services locally
```

## SSO walkthrough (target experience)

1. Open the **login page**, sign in once.
2. On the **portal**, click **Open App 1** → land on *Welcome APP1 homepage*.
3. Back on the portal, click **Open App 2** → you're signed in with **no second prompt** — that's SSO.
4. **Logout** at the IdP → both apps require login again (single logout).

## Status

Stage **P1.0** (infrastructure & docs) in progress. See the plan at
`~/.claude/plans/i-want-to-make-glittery-truffle.md`.
