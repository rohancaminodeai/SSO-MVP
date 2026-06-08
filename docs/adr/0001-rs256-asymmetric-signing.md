# ADR-0001 — RS256 asymmetric signing (not a shared secret)

Status: Accepted

## Context

Tokens minted by the IdP are verified by multiple tenant services. We need every tenant to be able
to *verify* a token, but only the IdP to be able to *create* one. A symmetric scheme (HS256) uses one
shared secret for both signing and verifying: every verifier would hold the power to forge.

## Decision

Sign tokens with **RS256** — an asymmetric algorithm. The IdP holds the **private key** and is the
only service that can sign. Tenants receive only the **public key** (published via JWKS) and can only
verify.

## Consequences

- A compromised tenant can verify tokens but **cannot forge** them for other tenants — the blast
  radius of one hacked service is contained.
- The power to mint tokens stays in exactly one place (the IdP).
- Trade-off: asymmetric crypto is slightly heavier than HMAC, and we must manage a keypair + publish
  a JWKS endpoint. Worth it for the isolation guarantee.
- Enables key rotation later via the `kid` header without redistributing secrets.
