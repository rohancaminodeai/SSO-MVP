# Architecture Decision Records (ADRs)

Each ADR captures one decision: **what** we decided, **why**, and the **trade-off**. They are short
and append-only — supersede rather than rewrite. New decision during a stage? Add a numbered file.

| # | Decision | Status |
|---|---|---|
| [0001](./0001-rs256-asymmetric-signing.md) | Use RS256 asymmetric signing (not a shared secret) | Accepted |
| [0002](./0002-pin-rs256-alg.md) | Pin `alg=RS256` on verification | Accepted |
| [0003](./0003-entitlements-in-token.md) | Carry entitlements inside the token | Accepted |
| [0004](./0004-offline-verification.md) | Tenants verify tokens offline | Accepted |
| [0005](./0005-idp-sub-link-and-jit-provisioning.md) | `idp_sub` link + just-in-time provisioning | Accepted |
| [0006](./0006-no-user-enumeration.md) | Constant-time login (no user enumeration) | Accepted |
| [0007](./0007-one-image-many-roles.md) | One image, many roles (config-per-tenant) | Accepted |
| [0008](./0008-idempotent-migration.md) | Idempotent, restartable migration | Accepted |

> ADR template: **Context** (the forces) · **Decision** (what we do) · **Consequences** (trade-off).
