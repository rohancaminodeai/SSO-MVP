# ADR-0007 — One image, many roles (config-per-tenant)

Status: Accepted

## Context

We run two tenant services (A and B) that are functionally identical — same code, same checks — but
serve different data. We could maintain two codebases/images, or one parameterized by configuration.

## Decision

Build **one** tenant image. `docker-compose.yml` runs it twice, injecting a different `TENANT_ID`
and `DATABASE_URL` per container. The `createApp({ tenantId, db, ... })` factory takes these as
arguments, so behavior is configured, not forked.

## Consequences

- Mirrors real multi-tenant deployments: every tenant runs identical code pointed at its own DB.
- One thing to build, test, and patch.
- The factory pattern that enables this also makes the service trivially testable (inject a throwaway
  DB + ephemeral keys), so the whole security pipeline can be tested in milliseconds without Docker.
- Trade-off: tenant-specific behavior, if ever needed, must be driven by config/flags rather than
  separate code — a healthy constraint for an MVP.
