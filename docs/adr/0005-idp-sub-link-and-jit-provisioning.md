# ADR-0005 — `idp_sub` link + just-in-time provisioning

Status: Accepted

## Context

There are two distinct notions of "user": the **global identity** at the IdP (one human, one `sub`)
and the **local account** at a tenant (profile, roles, owned data). A user entitled to a tenant may
not yet have a local row there. We must not conflate "allowed in" with "has an account here".

## Decision

- Each tenant's `users` table stores an **`idp_sub`** column linking its local row to the global
  identity's `sub`. Authorization keys off `sub`; local data keys off the local row.
- A user who is entitled but has no local row gets **403 no local user** (check #6). The tenant then
  **provisions** the local row just-in-time (on first visit / via `POST /provision`), after which
  requests succeed.

## Consequences

- Clean separation: the IdP owns *who you are*; the tenant owns *your account here*.
- New users flow naturally: entitlement (central) → first visit → JIT provisioning (local) → access.
- Trade-off: the very first request after signup returns 403 until provisioning runs — this is
  intentional and teaches that entitlement ≠ provisioning (study-guide Flow C).
