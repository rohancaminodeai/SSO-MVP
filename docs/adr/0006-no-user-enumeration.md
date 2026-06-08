# ADR-0006 — Constant-time login (no user enumeration)

Status: Accepted

## Context

A login endpoint that responds differently for "unknown email" vs "wrong password" — in message,
status, or **timing** — lets an attacker enumerate which emails are registered. Timing leaks because
bcrypt verification is slow but skipped entirely when the email is unknown.

## Decision

On login failure, return an **identical** response for both cases, and spend the **same time** in
both: when the email is unknown, still run a bcrypt comparison against a constant `DUMMY_HASH` before
returning the same `401 invalid credentials`.

```
if (!identity) { bcrypt.compareSync(password, DUMMY_HASH); throw Unauthorized("invalid credentials"); }
if (!bcrypt.compareSync(password, identity.password_hash)) throw Unauthorized("invalid credentials");
```

## Consequences

- Unknown email and wrong password are indistinguishable to an attacker, by content and by time.
- No hint about which accounts exist.
- Trade-off: a wasted hash computation on unknown-email requests — negligible, and the point.
