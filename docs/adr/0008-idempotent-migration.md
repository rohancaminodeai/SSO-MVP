# ADR-0008 — Idempotent, restartable migration

Status: Accepted

## Context

Before central login, each app had its own `users` table. Moving to the IdP must happen **without
downtime** and must be safe to re-run if it's interrupted partway.

## Decision

`migrate.ts` is **idempotent**. For each existing local user it: (1) creates-or-reuses a global
identity matched by email (so the same person across tenants becomes one global account), (2) grants
the tenant entitlement, and (3) stamps `idp_sub` back onto the local row. Already-linked rows are
skipped.

## Consequences

- Safe to run again and again — no duplicates appear; partial runs simply resume.
- Enables rolling out **one tenant at a time**, pausing and resuming, with nothing breaking.
- "Safe migration = restartable migration."
- Trade-off: every step must check-before-write (slightly more code), and email is the matching key,
  so duplicate/changed emails need a documented resolution rule.
