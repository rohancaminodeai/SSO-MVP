import express, { type Express } from "express";
import type { AppDeps } from "./types.ts";
import { loginRoute } from "./routes/login.ts";
import { signupRoute } from "./routes/signup.ts";
import { jwksRoute } from "./routes/jwks.ts";

/**
 * IdP application factory. Takes its dependencies (store, signing keys, issuer/
 * audience) as arguments so tests inject a throwaway in-memory store and an
 * ephemeral keypair, with no global state. Production wiring lives in server.ts.
 */
export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json());

  app.use(jwksRoute(deps));
  app.use(loginRoute(deps));
  app.use(signupRoute(deps));

  return app;
}
