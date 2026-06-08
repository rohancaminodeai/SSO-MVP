# ADR-0003 — Carry entitlements inside the token

Status: Accepted

## Context

Tenants must decide whether a user may access them ("authorization"). The data could live (a) in each
tenant's DB, (b) behind an IdP call on every request, or (c) inside the token itself.

Option (b) makes the IdP a per-request dependency and a bottleneck/SPOF. Option (a) scatters the
central grant decision across tenants.

## Decision

Embed an `entitlements` claim in the signed JWT, e.g. `{ "tenant_a": ["member"] }`. The IdP decides
entitlements once at login; the signature makes them tamper-proof; tenants read them directly.

## Consequences

- Tenants authorize **without calling the IdP per request** (see [ADR-0004](./0004-offline-verification.md)).
- The central grant decision stays at the IdP, but is enforced locally and cheaply.
- Trade-off: entitlements are only as fresh as the token. A revoked entitlement still works until the
  token expires (mitigated by the short 15-minute TTL). For an MVP this is an acceptable, well-known
  trade-off; production systems add revocation lists / introspection if they need instant revocation.
- `entitlements` ≠ a local account — see [ADR-0005](./0005-idp-sub-link-and-jit-provisioning.md).
