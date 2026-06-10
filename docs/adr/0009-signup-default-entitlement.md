# ADR-0009 — Signup grants a default entitlement (`tenant_a:[member]`)

Status: Accepted

## Context

`POST /signup` creates a central identity. But an identity with **no** entitlement is entitled to
*nothing* — it cannot reach any tenant, so it cannot demonstrate the Phase-1 flows. In a real system
entitlements are granted deliberately (by an admin, an approval workflow, or a self-service request
that is reviewed). This MVP has no admin UI (explicitly out of scope), yet it must produce a user that
is *entitled but not yet provisioned* — the precondition for Flow C (just-in-time provisioning,
[ADR-0005](./0005-idp-sub-link-and-jit-provisioning.md)).

Options considered:
- **(a)** Grant no entitlement at signup — but then a fresh user reaches no tenant and Flow C has
  nothing to demonstrate without a separate grant step the MVP doesn't have.
- **(b)** Let the caller pass the tenant(s) to grant — flexible, but raises a self-grant
  authorization question (who may grant what?) that is heavier than a study step needs.
- **(c)** Grant a fixed default at signup.

## Decision

Signup grants the new user a single default entitlement: `tenant_a:["member"]`. Signup creates the
identity and the grant; it does **not** issue a token (the user logs in separately).

## Consequences

- A brand-new user is immediately entitled to `tenant_a` but has **no local `users` row** there yet —
  exactly the Flow C precondition (403 *no local user* → `POST /provision` → 200) tested in P1.4.
- The grant logic lives in one place and is deterministic, so tests and the demo are simple.
- Trade-off: this is **not** how production grants access — it is a study-MVP convenience. A real IdP
  would gate entitlement behind an admin/approval step. Replacing this with option (b) or an admin
  endpoint is a natural follow-on exercise and would supersede this ADR.
