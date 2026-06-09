import express, { type Express } from "express";
import type { AppDeps } from "./types.ts";

/**
 * IdP application factory. STUB (P1.2 red) — every route returns 501 so the
 * acceptance tests fail until the real routes are implemented in the green step.
 */
export function createApp(_deps: AppDeps): Express {
  const app = express();
  app.use(express.json());
  app.use((_req, res) => res.status(501).json({ error: "not_implemented" }));
  return app;
}
