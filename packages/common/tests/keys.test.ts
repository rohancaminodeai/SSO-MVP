import { describe, it, expect } from "vitest";
import { generateKeySet, buildJwks } from "../src/keys.ts";

// Acceptance criteria 1–3 from specs/01-keys-jwt.md (TDD red).

describe("keys.ts — keypair + JWKS (spec 01)", () => {
  it("generates a key set with a non-empty kid (criterion 1)", async () => {
    const ks = await generateKeySet();
    expect(ks.kid).toBeTypeOf("string");
    expect(ks.kid.length).toBeGreaterThan(0);
  });

  it("publishes one RS256 signing key whose kid matches (criterion 2)", async () => {
    const ks = await generateKeySet();
    const jwks = await buildJwks(ks);
    expect(jwks.keys).toHaveLength(1);
    const key = jwks.keys[0]!;
    expect(key.kty).toBe("RSA");
    expect(key.use).toBe("sig");
    expect(key.alg).toBe("RS256");
    expect(key.kid).toBe(ks.kid);
  });

  it("never leaks private fields in the JWKS (criterion 3)", async () => {
    const ks = await generateKeySet();
    const jwks = await buildJwks(ks);
    const key = jwks.keys[0]! as Record<string, unknown>;
    for (const priv of ["d", "p", "q", "dp", "dq", "qi"]) {
      expect(key[priv]).toBeUndefined();
    }
    // sanity: the public modulus/exponent ARE present
    expect(key.n).toBeTypeOf("string");
    expect(key.e).toBeTypeOf("string");
  });
});
