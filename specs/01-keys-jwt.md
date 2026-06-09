# Spec 01 — Keys, JWT, JWKS & `alg` pinning (Stage P1.1)

> SDD contract for stage P1.1. Tests are written against the acceptance criteria *before* the
> implementation. See methodology in [CLAUDE.md](../CLAUDE.md). Decisions: ADR-0001 (RS256),
> ADR-0002 (pin `alg`).

## Goal

Build the cryptographic core that the whole trust model rests on, in `packages/common`:
- `keys.ts` — create/load an RSA keypair and publish the public half as a **JWKS** with a `kid`.
- `jwt.ts` — `mint()` a signed token (IdP only) and `verify()` it offline (every tenant),
  with the signing algorithm **pinned to RS256**.

## Why this stage exists

SSO trust = asymmetric signatures. The IdP signs with a **private** key; everyone else verifies with
the **public** key (fetched via JWKS). If verification is sloppy — trusting the token's own `alg`
header — classic forgeries (`alg:none`, RS256→HS256 confusion) succeed. This stage makes signing and
*safe* verification a reusable, well-tested primitive before any service uses it.

## Library

`jose` (already chosen in CLAUDE.md). Adds `jose` to `packages/common` dependencies.

## API contract

### `keys.ts`
```ts
interface KeySet { privateKey: CryptoKey; publicKey: CryptoKey; kid: string }

generateKeySet(): Promise<KeySet>              // ephemeral RSA keypair (tests / dev)
keySetFromPem(privPem, pubPem): Promise<KeySet> // load from PEM (prod wiring)
buildJwks(keySet): Promise<{ keys: JsonWebKey[] }> // public JWKS only
```
- `kid` is the RFC 7638 JWK thumbprint of the public key (stable, rotation-friendly).
- `buildJwks` emits exactly one key: `{ kty:"RSA", use:"sig", alg:"RS256", kid, n, e }` and **must
  not** include any private fields (`d`, `p`, `q`, `dp`, `dq`, `qi`).

### `jwt.ts`
```ts
interface MintParams { sub; email; entitlements: Record<string,string[]>;
                       issuer; audience; ttlSeconds?: number }

mint(keySet, params): Promise<string>          // signs RS256, header { alg:"RS256", kid }
verify(token, { key, issuer, audience }): Promise<JWTPayload>  // OFFLINE, alg-pinned
```
- `mint` sets `iss`, `aud`, `sub`, `iat`, `exp` (default TTL = `ACCESS_TOKEN_TTL_SECONDS` = 900s) and
  custom claims `email`, `entitlements`.
- `verify` uses `algorithms: ["RS256"]` and `clockTolerance: CLOCK_LEEWAY_SECONDS` (60s), and
  enforces `issuer`/`audience`. On any failure it throws (callers map to 401 later).

## Acceptance criteria (→ failing tests first)

**keys.ts**
1. `generateKeySet()` returns a non-empty `kid`.
2. `buildJwks()` returns one key with `kty:"RSA"`, `use:"sig"`, `alg:"RS256"`, and a `kid` equal to
   `keySet.kid`.
3. The published JWKS key contains **no** private fields (`d`/`p`/`q`/`dp`/`dq`/`qi`).

**jwt.ts**
4. **Roundtrip:** a token minted then verified yields back `sub`, `email`, `entitlements`, and the
   correct `iss`/`aud`.
5. **Tamper rejection:** flipping a character in the token body makes `verify` throw.
6. **`alg:none` rejected:** a token with header `{"alg":"none"}` and no signature is rejected.
7. **HS256 confusion rejected:** a token signed with HS256 (secret = the public key bytes) is rejected
   by the RS256-pinned verifier.
8. **Expiry rejected:** a token whose `exp` is in the past beyond the 60s leeway is rejected.
9. **Leeway honored:** a token expired by only ~30s (within the 60s leeway) still verifies.
10. **Issuer mismatch rejected** and **audience mismatch rejected**.

## Out of scope (later stages)

Serving JWKS over HTTP (`/.well-known/jwks.json` is P1.2), remote JWKS fetching + caching in tenants
(`createRemoteJWKSet`, P1.3), password handling (P1.2).

## Checkpoint

`npm test` green for all P1.1 criteria; demonstrate a mint→decode by eye (header shows
`alg:RS256` + `kid`; payload shows the claims). Produce the required summary + study-material docs.
Then pause for review.
