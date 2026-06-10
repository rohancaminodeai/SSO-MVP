import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { hashPassword } from "@sso/common";
import type { AppDeps } from "../types.ts";

const SignupBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

/** The tenant a brand-new user is granted membership in by default (ADR-0009). */
const DEFAULT_TENANT = "tenant_a";

/**
 * POST /signup — create a central identity and grant the default entitlement.
 * No token is issued; the user logs in separately. The new user is now entitled
 * to tenant_a but has no local users row there yet — the Flow C precondition (P1.4).
 */
export function signupRoute(deps: AppDeps): Router {
  const router = Router();
  const newSub = deps.newSub ?? (() => `u_${randomUUID()}`);

  router.post("/signup", async (req, res) => {
    const parsed = SignupBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_request" });

    const email = parsed.data.email.toLowerCase();
    if (await deps.store.findIdentityByEmail(email)) {
      return res.status(409).json({ error: "email_taken" });
    }

    const sub = newSub();
    const passwordHash = await hashPassword(parsed.data.password);
    await deps.store.createIdentity({ sub, email, passwordHash, name: parsed.data.name });
    await deps.store.grantEntitlement(sub, DEFAULT_TENANT, ["member"]);

    return res.status(201).json({ sub, email });
  });

  return router;
}
