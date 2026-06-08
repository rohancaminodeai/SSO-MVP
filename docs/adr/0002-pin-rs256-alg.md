# ADR-0002 — Pin `alg=RS256` on verification

Status: Accepted

## Context

JWT libraries historically trusted the token's own `alg` header to decide how to verify it. Two
classic attacks exploit this:

- **`alg: none`** — attacker sets the algorithm to "none" and strips the signature; a naive verifier
  accepts an unsigned token.
- **Algorithm confusion (RS256 → HS256)** — attacker changes `alg` to HS256 and signs with the
  *public* key (which is, well, public). A verifier that uses the public key as an HMAC secret
  accepts the forgery.

## Decision

When verifying, **explicitly pin the allowed algorithms to `["RS256"]`** and never read the
algorithm from the token. In code: `jwtVerify(token, key, { algorithms: ["RS256"] })`.

## Consequences

- Both attacks above are dead on arrival.
- Verification logic is simpler and unambiguous.
- Trade-off: changing the signing algorithm in future requires a deliberate code change (acceptable —
  it should be deliberate). Never relax the pin to "accept any".
