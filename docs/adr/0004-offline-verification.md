# ADR-0004 — Tenants verify tokens offline

Status: Accepted

## Context

Each tenant must validate incoming tokens. It could call the IdP to validate every request
(introspection), or validate locally using the IdP's public key.

## Decision

Tenants fetch the IdP's public keys from JWKS **once**, cache them, and verify every token
**offline** (signature + `iss`/`aud`/`exp` + `alg` pin). No per-request call to the IdP.

## Consequences

- **IdP-down resilience:** if the IdP is unavailable, in-flight users keep working because tenants
  don't need it to verify. Only *new logins* (minting) are blocked. This is "fail-open for
  validation, fail-closed for new authentication."
- Lower latency and no IdP bottleneck on the hot path.
- Trade-off: the same freshness limitation as [ADR-0003](./0003-entitlements-in-token.md) — a token
  remains valid until it expires even if something changed centrally. Bounded by the short TTL.
- Requires cache invalidation/refresh strategy for JWKS when keys rotate (selected via `kid`).
