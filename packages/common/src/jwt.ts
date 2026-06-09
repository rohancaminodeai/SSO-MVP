import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { ALG, ACCESS_TOKEN_TTL_SECONDS, CLOCK_LEEWAY_SECONDS } from "./config.ts";
import type { KeySet } from "./keys.ts";

/**
 * Token minting (IdP only) and verification (every tenant, OFFLINE).
 * Verification PINS the algorithm to RS256 (ADR-0002) so `alg:none` and
 * RS256→HS256 confusion forgeries are rejected.
 */

export interface MintParams {
  sub: string;
  email: string;
  /** e.g. { tenant_a: ["member"] } — authorization travels inside the signed token. */
  entitlements: Record<string, string[]>;
  issuer: string;
  audience: string;
  /** Override the token lifetime (seconds). Defaults to 15 min. Negative = already expired (tests). */
  ttlSeconds?: number;
}

/** Sign a JWT with the private key. Header carries `alg:RS256` + the key's `kid`. */
export async function mint(keySet: KeySet, params: MintParams): Promise<string> {
  const ttl = params.ttlSeconds ?? ACCESS_TOKEN_TTL_SECONDS;
  const iat = Math.floor(Date.now() / 1000);

  return new SignJWT({ email: params.email, entitlements: params.entitlements })
    .setProtectedHeader({ alg: ALG, kid: keySet.kid })
    .setIssuer(params.issuer)
    .setAudience(params.audience)
    .setSubject(params.sub)
    .setIssuedAt(iat)
    .setExpirationTime(iat + ttl)
    .sign(keySet.privateKey);
}

export interface VerifyOptions {
  /** Public key (P1.1) — later stages pass a cached remote JWKS resolver instead. */
  key: CryptoKey;
  issuer: string;
  audience: string;
}

/**
 * Verify a token offline. Throws on any failure (bad signature, wrong alg,
 * expired beyond leeway, issuer/audience mismatch). Callers map the throw to 401.
 */
export async function verify(token: string, opts: VerifyOptions): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, opts.key, {
    algorithms: [ALG], // ← the pin: only RS256, never `none`/HS256
    issuer: opts.issuer,
    audience: opts.audience,
    clockTolerance: CLOCK_LEEWAY_SECONDS,
  });
  return payload;
}
