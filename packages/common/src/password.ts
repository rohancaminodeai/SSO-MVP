/**
 * Password hashing + the constant-time-login primitive. STUB (P1.2 red) —
 * implemented in the green step. See specs/02-auth-service.md and ADR-0006.
 */

export const DUMMY_HASH = "";

export function hashPassword(_plain: string): Promise<string> {
  throw new Error("not implemented");
}

export function verifyPassword(_plain: string, _hash: string): Promise<boolean> {
  throw new Error("not implemented");
}
