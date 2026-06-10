-- auth_db schema (P1.2). Idempotent: safe to run on every boot.
-- The IdP owns the central identities and the entitlement grants.

CREATE TABLE IF NOT EXISTS identities (
  sub           text PRIMARY KEY,                 -- global user id, e.g. u_<uuid>
  email         text UNIQUE NOT NULL,             -- stored lowercased
  password_hash text NOT NULL,                    -- bcrypt; never leaves this DB
  name          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Who may enter which tenant. Read at login and embedded in the signed token.
CREATE TABLE IF NOT EXISTS entitlements (
  sub        text NOT NULL REFERENCES identities(sub) ON DELETE CASCADE,
  tenant_id  text NOT NULL,
  roles      text[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (sub, tenant_id)
);
