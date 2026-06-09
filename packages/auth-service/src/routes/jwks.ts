import { Router } from "express";
import { buildJwks } from "@sso/common";
import type { AppDeps } from "../types.ts";

/**
 * GET /.well-known/jwks.json — publish the PUBLIC verification key so tenants can
 * fetch it once, cache it, and verify tokens offline. The private key never leaves
 * the IdP; buildJwks emits public fields only (no d/p/q/dp/dq/qi).
 */
export function jwksRoute(deps: AppDeps): Router {
  const router = Router();

  router.get("/.well-known/jwks.json", async (_req, res) => {
    const jwks = await buildJwks(deps.keySet);
    // Tenants may cache for 5 minutes; rotation stays safe because each key has a kid.
    res.set("Cache-Control", "public, max-age=300");
    return res.status(200).json(jwks);
  });

  return router;
}
