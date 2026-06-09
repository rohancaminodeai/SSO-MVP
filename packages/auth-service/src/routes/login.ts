import { Router } from "express";
import { z } from "zod";
import { mint, verifyPassword, DUMMY_HASH, ACCESS_TOKEN_TTL_SECONDS } from "@sso/common";
import type { AppDeps } from "../types.ts";

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * POST /login — the one place a password is checked. On success, mints an
 * entitlement-carrying RS256 JWT. Failures are constant-response AND constant-time
 * (ADR-0006): unknown email and wrong password are indistinguishable.
 */
export function loginRoute(deps: AppDeps): Router {
  const router = Router();

  router.post("/login", async (req, res) => {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_request" });

    const email = parsed.data.email.toLowerCase();
    const identity = await deps.store.findIdentityByEmail(email);

    // Always run exactly one bcrypt compare. When the email is unknown we compare
    // against DUMMY_HASH so the request still spends the hashing time — no timing
    // leak that would reveal which emails are registered.
    const ok = await verifyPassword(parsed.data.password, identity?.passwordHash ?? DUMMY_HASH);
    if (!identity || !ok) return res.status(401).json({ error: "invalid_credentials" });

    const entitlements = await deps.store.getEntitlements(identity.sub);
    const access_token = await mint(deps.keySet, {
      sub: identity.sub,
      email: identity.email,
      entitlements,
      issuer: deps.issuer,
      audience: deps.audience,
    });

    return res.status(200).json({
      access_token,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
    });
  });

  return router;
}
