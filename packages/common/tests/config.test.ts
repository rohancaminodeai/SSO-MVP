import { describe, it, expect } from "vitest";
import {
  ALG,
  ISSUER_DEFAULT,
  AUDIENCE_DEFAULT,
  ACCESS_TOKEN_TTL_SECONDS,
  CLOCK_LEEWAY_SECONDS,
  TENANT_IDS,
  loadConfig,
} from "../src/config.ts";

// Acceptance criteria from specs/00-infra.md, written before the implementation (TDD red).

describe("pinned token constants (spec 00, criterion 1)", () => {
  it("pins RS256 as the signing algorithm", () => {
    expect(ALG).toBe("RS256");
  });

  it("uses a 15-minute (900s) access-token TTL", () => {
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(900);
  });

  it("allows ±60s clock leeway", () => {
    expect(CLOCK_LEEWAY_SECONDS).toBe(60);
  });

  it("knows the two tenants", () => {
    expect(TENANT_IDS).toContain("tenant_a");
    expect(TENANT_IDS).toContain("tenant_b");
  });
});

describe("loadConfig env loader (spec 00, criteria 2 & 3)", () => {
  it("returns dev defaults when no env is set", () => {
    const cfg = loadConfig({});
    expect(cfg.issuer).toBe(ISSUER_DEFAULT);
    expect(cfg.issuer).toBe("http://localhost:8000");
    expect(cfg.audience).toBe(AUDIENCE_DEFAULT);
    expect(cfg.audience).toBe("platform-tenants");
  });

  it("parses provided values", () => {
    const cfg = loadConfig({
      ISSUER: "https://auth.example.com",
      AUDIENCE: "my-aud",
      AUTH_DATABASE_URL: "postgres://u:p@db:5432/auth_db",
      TENANT_ID: "tenant_b",
    });
    expect(cfg.issuer).toBe("https://auth.example.com");
    expect(cfg.audience).toBe("my-aud");
    expect(cfg.databaseUrl).toBe("postgres://u:p@db:5432/auth_db");
    expect(cfg.tenantId).toBe("tenant_b");
  });

  it("rejects an unknown TENANT_ID", () => {
    expect(() => loadConfig({ TENANT_ID: "tenant_zzz" })).toThrow();
  });

  it("rejects a malformed ISSUER url", () => {
    expect(() => loadConfig({ ISSUER: "not-a-url" })).toThrow();
  });

  it("prefers a service-specific database url via the dbUrlKey option", () => {
    const cfg = loadConfig(
      { TENANT_B_DATABASE_URL: "postgres://u:p@db:5432/tenant_b_db" },
      { dbUrlKey: "TENANT_B_DATABASE_URL" },
    );
    expect(cfg.databaseUrl).toBe("postgres://u:p@db:5432/tenant_b_db");
  });
});
