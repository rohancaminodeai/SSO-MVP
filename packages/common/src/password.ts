import bcrypt from "bcrypt";

/**
 * Password hashing + the constant-time-login primitive.
 *
 * bcrypt is intentionally slow (a "work factor") so brute-forcing a stolen hash
 * is expensive. See specs/02-auth-service.md and ADR-0006 (no user enumeration).
 */

/** Cost factor: 2^12 rounds. Higher = slower = harder to brute-force. */
const SALT_ROUNDS = 12;

/**
 * A real bcrypt hash that NO password will ever match. On an unknown email the
 * login route compares the submitted password against this so the request still
 * spends bcrypt time — making "unknown email" and "wrong password" take the same
 * time (ADR-0006). It is precomputed (not generated at boot) so it is constant.
 */
export const DUMMY_HASH = "$2b$12$rSZgZU/i.NQgu6IdrGizo.vYC.t5HCYhVxr5zLtpZDXWsIbO7I.Cq";

/** Hash a plaintext password for storage. */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/** Constant-time-ish compare of a plaintext password against a stored bcrypt hash. */
export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
