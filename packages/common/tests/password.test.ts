import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, DUMMY_HASH } from "../src/password.ts";

// Acceptance criteria 1–2 from specs/02-auth-service.md (TDD red).

describe("password.ts — hash/verify (spec 02)", () => {
  it("verifies the correct password and rejects a wrong one (criterion 1)", async () => {
    const hash = await hashPassword("password123");
    expect(await verifyPassword("password123", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("DUMMY_HASH is a real bcrypt hash that no password matches (criterion 2)", async () => {
    // Shape of a bcrypt hash: $2[aby]$<cost>$<22+31 chars>.
    expect(DUMMY_HASH).toMatch(/^\$2[aby]\$\d{2}\$.{53}$/);
    expect(await verifyPassword("anything", DUMMY_HASH)).toBe(false);
  });
});
