import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { importJWK, jwtVerify } from "jose";
import { mint } from "@sso/common";
import { makeApp, ISSUER, AUDIENCE, type TestApp } from "./helpers.ts";

// Acceptance criteria 11–13 from specs/02-auth-service.md (TDD red).

let t: TestApp;
beforeEach(async () => {
  t = await makeApp();
});

describe("GET /.well-known/jwks.json (spec 02)", () => {
  it("serves exactly one public RS256 key with the signing kid (criterion 11)", async () => {
    const res = await request(t.app).get("/.well-known/jwks.json");
    expect(res.status).toBe(200);
    expect(res.body.keys).toHaveLength(1);
    const [jwk] = res.body.keys;
    expect(jwk.kty).toBe("RSA");
    expect(jwk.use).toBe("sig");
    expect(jwk.alg).toBe("RS256");
    expect(jwk.kid).toBe(t.keySet.kid);
  });

  it("never leaks private key material (criterion 12)", async () => {
    const res = await request(t.app).get("/.well-known/jwks.json");
    const [jwk] = res.body.keys;
    for (const priv of ["d", "p", "q", "dp", "dq", "qi"]) {
      expect(jwk[priv]).toBeUndefined();
    }
  });

  it("a token minted by the IdP verifies against the served key (criterion 13)", async () => {
    const token = await mint(t.keySet, {
      sub: "u_bob",
      email: "bob@example.com",
      entitlements: { tenant_a: ["member"] },
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    const res = await request(t.app).get("/.well-known/jwks.json");
    const [jwk] = res.body.keys;
    const pub = await importJWK(jwk, "RS256");
    const { payload } = await jwtVerify(token, pub, {
      algorithms: ["RS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    expect(payload.sub).toBe("u_bob");
  });
});
