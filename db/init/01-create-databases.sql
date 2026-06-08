-- Runs once on first Postgres init (docker-entrypoint-initdb.d).
-- Each service owns its own database; a tenant can never read another tenant's data.
CREATE DATABASE auth_db;
CREATE DATABASE tenant_a_db;
CREATE DATABASE tenant_b_db;

-- The `sso` superuser (POSTGRES_USER) already owns them; no extra grants needed for the MVP.
