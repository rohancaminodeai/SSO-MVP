import {
  generateKeyPair,
  importPKCS8,
  importSPKI,
  exportJWK,
  calculateJwkThumbprint,
  type JWK,
} from "jose";
import { ALG } from "./config.ts";

/**
 * RSA key management for the IdP's signing key (ADR-0001: asymmetric RS256).
 *
 * - The PRIVATE key signs tokens and must live ONLY inside the IdP.
 * - The PUBLIC key is published as a JWKS so anyone can VERIFY (never forge).
 */
export interface KeySet {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  /** RFC 7638 JWK thumbprint of the public key — stable id, used in the token header + JWKS. */
  kid: string;
}

async function thumbprint(publicKey: CryptoKey): Promise<string> {
  const jwk = await exportJWK(publicKey);
  return calculateJwkThumbprint(jwk, "sha256");
}

/** Generate an ephemeral RSA keypair. Used by tests and local dev. */
export async function generateKeySet(): Promise<KeySet> {
  // extractable so we can export the public JWK (for the thumbprint + JWKS).
  const { privateKey, publicKey } = await generateKeyPair(ALG, { extractable: true });
  return { privateKey, publicKey, kid: await thumbprint(publicKey) };
}

/** Load a key set from PEM strings (production wiring reads these from a secret store). */
export async function keySetFromPem(privatePem: string, publicPem: string): Promise<KeySet> {
  const privateKey = await importPKCS8(privatePem, ALG, { extractable: true });
  const publicKey = await importSPKI(publicPem, ALG, { extractable: true });
  return { privateKey, publicKey, kid: await thumbprint(publicKey) };
}

/**
 * Build the public JWKS (JSON Web Key Set). Emits ONLY the public half — the
 * private fields (d/p/q/dp/dq/qi) are never exported here. `kid` lets verifiers
 * pick the right key (and enables rotation later).
 */
export async function buildJwks(keySet: KeySet): Promise<{ keys: JWK[] }> {
  const jwk = await exportJWK(keySet.publicKey); // public key → { kty, n, e }
  return {
    keys: [{ ...jwk, kid: keySet.kid, alg: ALG, use: "sig" }],
  };
}
