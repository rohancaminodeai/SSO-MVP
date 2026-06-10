import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { verify } from "@sso/common";
import { makeApp, ISSUER, AUDIENCE, type TestApp } from "./helpers.ts";

// Acceptance criteria 8–10 from specs/02-auth-service.md (TDD red).

let t: TestApp;
beforeEach(async () => {
  t = await makeApp();
});

describe("POST /signup (spec 02)", () => {
  it("new email → 201, default tenant_a entitlement, then login carries it (criterion 8)", async () => {
    const signup = await request(t.app)
      .post("/signup")
      .send({ email: "carol@example.com", password: "carolpass1", name: "Carol" });

    expect(signup.status).toBe(201);
    expect(signup.body.email).toBe("carol@example.com");
    expect(typeof signup.body.sub).toBe("string");

    // The identity now exists with the default grant.
    const identity = await t.store.findIdentityByEmail("carol@example.com");
    expect(identity).not.toBeNull();
    expect(await t.store.getEntitlements(identity!.sub)).toEqual({ tenant_a: ["member"] });

    // And logging in returns a token carrying that entitlement.
    const login = await request(t.app)
      .post("/login")
      .send({ email: "carol@example.com", password: "carolpass1" });
    expect(login.status).toBe(200);
    const payload = await verify(login.body.access_token, {
      key: t.keySet.publicKey,
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    expect(payload.entitlements).toEqual({ tenant_a: ["member"] });
  });

  it("duplicate email (case-insensitive) → 409 email_taken (criterion 9)", async () => {
    const res = await request(t.app)
      .post("/signup")
      .send({ email: "ALICE@example.com", password: "whatever1", name: "Alice 2" });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "email_taken" });
  });

  it("password shorter than 8 chars → 400 invalid_request (criterion 10)", async () => {
    const res = await request(t.app)
      .post("/signup")
      .send({ email: "dan@example.com", password: "short", name: "Dan" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_request" });
  });
});
