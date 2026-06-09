import { describe, it, expect, beforeAll } from "vitest";
import { SignJWT, base64url } from "jose";
import { generateKeySet, type KeySet } from "../src/keys.ts";
import { mint, verify } from "../src/jwt.ts";

// Acceptance criteria 4–10 from specs/01-keys-jwt.md (TDD red).

const ISSUER = "http://localhost:8000";
const AUDIENCE = "platform-tenants";

let ks: KeySet;
const base = () => ({
  sub: "u_alice",
  email: "alice@example.com",
  entitlements: { tenant_a: ["member"] },
  issuer: ISSUER,
  audience: AUDIENCE,
});

beforeAll(async () => {
  ks = await generateKeySet();
});

describe("jwt.ts — mint/verify (spec 01)", () => {
  it("roundtrips claims (criterion 4)", async () => {
    const token = await mint(ks, base());
    const payload = await verify(token, { key: ks.publicKey, issuer: ISSUER, audience: AUDIENCE });
    expect(payload.sub).toBe("u_alice");
    expect(payload.email).toBe("alice@example.com");
    expect(payload.entitlements).toEqual({ tenant_a: ["member"] });
    expect(payload.iss).toBe(ISSUER);
    expect(payload.aud).toBe(AUDIENCE);
  });

  it("rejects a tampered token (criterion 5)", async () => {
    const token = await mint(ks, base());
    const [h, p, s] = token.split(".");
    // flip a character in the payload segment
    const tampered = `${h}.${p!.slice(0, -1)}${p!.slice(-1) === "A" ? "B" : "A"}.${s}`;
    await expect(verify(tampered, { key: ks.publicKey, issuer: ISSUER, audience: AUDIENCE }))
      .rejects.toThrow();
  });

  it("rejects an alg:none token (criterion 6)", async () => {
    const header = base64url.encode(JSON.stringify({ alg: "none" }));
    const now = Math.floor(Date.now() / 1000);
    const payload = base64url.encode(
      JSON.stringify({ iss: ISSUER, aud: AUDIENCE, sub: "u_alice", iat: now, exp: now + 900 }),
    );
    const noneToken = `${header}.${payload}.`;
    await expect(verify(noneToken, { key: ks.publicKey, issuer: ISSUER, audience: AUDIENCE }))
      .rejects.toThrow();
  });

  it("rejects an HS256-confused token (criterion 7)", async () => {
    const now = Math.floor(Date.now() / 1000);
    // attacker signs with HS256 using a secret they control
    const hsToken = await new SignJWT({ email: "evil@example.com", entitlements: {} })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject("u_alice")
      .setIssuedAt(now)
      .setExpirationTime(now + 900)
      .sign(new TextEncoder().encode("public-key-bytes-known-to-attacker"));
    await expect(verify(hsToken, { key: ks.publicKey, issuer: ISSUER, audience: AUDIENCE }))
      .rejects.toThrow();
  });

  it("rejects a token expired beyond leeway (criterion 8)", async () => {
    const token = await mint(ks, { ...base(), ttlSeconds: -120 }); // exp 120s ago
    await expect(verify(token, { key: ks.publicKey, issuer: ISSUER, audience: AUDIENCE }))
      .rejects.toThrow();
  });

  it("accepts a token expired within the 60s leeway (criterion 9)", async () => {
    const token = await mint(ks, { ...base(), ttlSeconds: -30 }); // exp 30s ago, within leeway
    const payload = await verify(token, { key: ks.publicKey, issuer: ISSUER, audience: AUDIENCE });
    expect(payload.sub).toBe("u_alice");
  });

  it("rejects an issuer mismatch (criterion 10a)", async () => {
    const token = await mint(ks, base());
    await expect(verify(token, { key: ks.publicKey, issuer: "http://evil", audience: AUDIENCE }))
      .rejects.toThrow();
  });

  it("rejects an audience mismatch (criterion 10b)", async () => {
    const token = await mint(ks, base());
    await expect(verify(token, { key: ks.publicKey, issuer: ISSUER, audience: "other-aud" }))
      .rejects.toThrow();
  });
});
