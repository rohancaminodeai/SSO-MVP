import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { verify } from "@sso/common";
import { makeApp, ISSUER, AUDIENCE, SEED_PASSWORD, type TestApp } from "./helpers.ts";

// Wrap verifyPassword with a spy (still calls through) so we can prove the
// no-enumeration path runs even for an unknown email (criterion 6).
vi.mock("@sso/common", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@sso/common")>();
  return { ...actual, verifyPassword: vi.fn(actual.verifyPassword) };
});
import { verifyPassword } from "@sso/common";

// Acceptance criteria 3–7 from specs/02-auth-service.md (TDD red).

let t: TestApp;
beforeEach(async () => {
  vi.clearAllMocks();
  t = await makeApp();
});

describe("POST /login (spec 02)", () => {
  it("valid credentials → 200 with a verifiable entitlement-carrying token (criterion 3)", async () => {
    const res = await request(t.app)
      .post("/login")
      .send({ email: "bob@example.com", password: SEED_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.token_type).toBe("Bearer");
    expect(res.body.expires_in).toBe(900);
    expect(typeof res.body.access_token).toBe("string");

    const payload = await verify(res.body.access_token, {
      key: t.keySet.publicKey,
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    expect(payload.sub).toBe("u_bob");
    expect(payload.email).toBe("bob@example.com");
    expect(payload.entitlements).toEqual({ tenant_a: ["member"], tenant_b: ["member"] });
  });

  it("wrong password → 401 invalid_credentials (criterion 4)", async () => {
    const res = await request(t.app)
      .post("/login")
      .send({ email: "alice@example.com", password: "nope" });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "invalid_credentials" });
  });

  it("unknown email → 401, byte-identical to wrong password (criterion 5)", async () => {
    const wrongPw = await request(t.app)
      .post("/login")
      .send({ email: "alice@example.com", password: "nope" });
    const unknown = await request(t.app)
      .post("/login")
      .send({ email: "ghost@example.com", password: "nope" });

    expect(unknown.status).toBe(wrongPw.status);
    expect(unknown.body).toEqual(wrongPw.body);
    expect(unknown.status).toBe(401);
  });

  it("unknown email still runs a bcrypt compare — no enumeration (criterion 6)", async () => {
    await request(t.app)
      .post("/login")
      .send({ email: "ghost@example.com", password: "nope" });
    // The handler must still spend time hashing (against DUMMY_HASH) rather than
    // returning early when the email is unknown.
    expect(verifyPassword).toHaveBeenCalled();
  });

  it("malformed body → 400 invalid_request, no token (criterion 7)", async () => {
    const res = await request(t.app).post("/login").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_request" });
    expect(res.body.access_token).toBeUndefined();
  });
});
