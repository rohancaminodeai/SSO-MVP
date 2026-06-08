# Phase 3 — Taking the SSO MVP to AWS (real-world)

> Status: study/design doc. Phase 3 is optional but recommended — it turns the local MVP into a
> production-shaped deployment. Read [ARCHITECTURE.md](./ARCHITECTURE.md) first.

## 0. First, the mental model (corrected)

You had it right, with one fix:

```
   id + password
   ───────────────►  IdP  ──issues signed token──►  user
                      │ signs the token with its PRIVATE key   (private key NEVER leaves the IdP)
                      │ publishes its PUBLIC key at /.well-known/jwks.json
                      ▼
   user --Bearer token-->  APP1 / APP2 (EC2)
                            └─ holds the PUBLIC key, VERIFIES the signature
                               (proves the token came from the IdP, unforged)
                               then runs the 6 checks → 200 / 401 / 403
```

- **IdP** = the only place passwords are checked; it **signs** tokens with its **private key**.
- **APP1 / APP2** = resource servers; they **verify** with the **public key**. They never hold the
  private key and never check passwords. (Same as Phase 1, just running on AWS now.)

## 1. Is it worth practicing? Yes — and here's why

Phase 1–2 taught the *protocol* (how tokens are minted, verified, and trusted). Phase 3 teaches the
*operations* every real SSO deployment needs: HTTPS/TLS termination, DNS, private networking, secret
storage for the signing key, a managed database, and (optionally) a managed IdP. These are exactly
the skills a real-world engagement expects.

## 2. Two real-world paths (do them in order)

| | **Phase 3a — Self-host your IdP on AWS** | **Phase 3b — Swap to Amazon Cognito (managed IdP)** |
|---|---|---|
| What you keep | Your Node IdP + tenant apps, deployed to AWS | Your tenant apps; **Cognito replaces the IdP** |
| You learn | VPC, EC2/ECS, ALB, ACM/TLS, RDS, Secrets Manager, Route 53 | How companies actually use a managed OIDC IdP; ALB OIDC offload; Cognito groups → entitlements |
| Crypto/keys | You manage the RSA keypair (Secrets Manager / KMS) | AWS manages keys + JWKS for you |
| Effort | More infra, full control | Far less code; production-grade login UI for free |
| Realism | "We run our own IdP" (banks, large enterprises) | "We use a managed IdP" (the common default today) |

**Recommendation:** do **3a first** (you already understand the IdP internals — now run them in the
cloud), then **3b** to feel the difference a managed IdP makes. 3b reuses the *same* tenant apps
because they only need an issuer + JWKS URL — and Cognito provides both.

---

## 3. Phase 3a — Self-hosted IdP on AWS

### Overall system picture

```
                      Internet
                         │  (HTTPS only, TLS cert from ACM)
                  ┌──────▼───────┐   Route 53 DNS:
                  │  Application  │     auth.example.com  → IdP target group
                  │ Load Balancer│     app1.example.com  → APP1 target group
                  │   (public)   │     app2.example.com  → APP2 target group
                  └──┬───┬───┬───┘
        ┌────────────┘   │   └────────────┐         (ALB lives in PUBLIC subnets)
        ▼                ▼                ▼
   ┌─────────┐     ┌─────────┐     ┌─────────┐       (apps live in PRIVATE subnets,
   │  IdP    │     │  APP1   │     │  APP2   │        reachable only via the ALB)
   │ EC2/ECS │     │  EC2    │     │  EC2    │
   │  :8000  │     │  :8001  │     │  :8002  │
   └────┬────┘     └────┬────┘     └────┬────┘
        │               │               │
        │  Secrets Mgr  │  cache JWKS    │  cache JWKS   (apps fetch auth.example.com/.well-known/jwks.json
        │  (private key)│  from IdP      │  from IdP      over HTTPS, then verify OFFLINE)
        ▼               ▼               ▼
   ┌───────────────────────────────────────────┐
   │   Amazon RDS (PostgreSQL), private subnets │
   │   auth_db │ tenant_a_db │ tenant_b_db      │
   └───────────────────────────────────────────┘

   VPC = 2 public subnets (ALB) + 2 private subnets (apps + RDS) across 2 AZs.
   NAT Gateway lets private instances reach the internet for updates/JWKS if needed.
```

### Component → AWS service mapping

| MVP piece | AWS service | Notes |
|---|---|---|
| IdP (`auth-service`) | **EC2** (or **ECS Fargate**) behind ALB | Start with EC2 to match your mental model; ECS later removes server management |
| APP1 / APP2 (`tenant-service`) | **EC2** ×2 behind ALB | "One image, many roles" → same AMI/container, different `TENANT_ID` (ADR-0007) |
| Public entry + TLS | **Application Load Balancer** + **ACM** certificate | HTTPS terminates at the ALB; host-based routing per subdomain |
| DNS | **Route 53** | `auth/app1/app2.example.com` → ALB |
| Database | **Amazon RDS for PostgreSQL** | One instance, three databases (or three instances). Multi-AZ for HA |
| Signing **private key** | **AWS Secrets Manager** (or **KMS** for sign-without-exporting) | The key never sits in code or an AMI. KMS = key truly never leaves AWS |
| DB credentials | **Secrets Manager** | App reads at boot via IAM role |
| Permissions | **IAM roles** (instance profiles) | Each EC2 gets least-privilege access (e.g. only the IdP can read the private key) |
| Network isolation | **VPC**, subnets, **security groups** | ALB→app on app port only; app→RDS on 5432 only; nothing else |
| Logs/metrics | **CloudWatch** | App logs + ALB access logs (to S3) |

### Why each piece (the "what matters")

- **ALB + ACM (HTTPS):** tokens travel in `Authorization` headers — they must never cross plain HTTP.
  TLS terminates at the ALB; the signing key and tokens stay confidential in transit.
- **Private subnets for apps + RDS:** the only way in is the ALB. EC2 apps and the database have no
  public IPs → far smaller attack surface.
- **Security groups as a firewall:** ALB can talk to app ports; apps can talk to RDS:5432; the IdP
  alone can read the private-key secret. This enforces the isolation invariant at the network layer,
  complementing check #5 in code.
- **Secrets Manager / KMS for the private key:** this is the single most sensitive artifact (whoever
  holds it can forge any token). It must live in a managed secret store with IAM access, *not* baked
  into an AMI or env file. KMS goes further — the IdP asks KMS to *sign*, so the key never leaves AWS.
- **RDS:** managed backups, patching, Multi-AZ failover — the "don't run your own database in prod"
  lesson.

### Setup walkthrough (study path)

Do it twice: first by **clicking in the console** to understand each piece, then **as code**
(CloudFormation/Terraform/CDK) so it's repeatable.

1. **Networking** — create a VPC with 2 public + 2 private subnets across 2 AZs; an Internet Gateway;
   a NAT Gateway; route tables.
2. **Database** — launch RDS PostgreSQL in the private subnets; create `auth_db`, `tenant_a_db`,
   `tenant_b_db`; store the connection string in Secrets Manager.
3. **Secrets/keys** — generate the RSA keypair; put the **private** key in Secrets Manager (or create
   a KMS signing key); the **public** key is served by the IdP via JWKS.
4. **Build artifacts** — containerize the IdP and tenant images (or bake an AMI). Push images to
   **ECR**.
5. **Compute** — launch the IdP and two tenant EC2 instances (or ECS services) in private subnets;
   give each an IAM role (only the IdP role can read the private key).
6. **Load balancer** — create the ALB in public subnets; one target group per service; an HTTPS:443
   listener with the ACM cert; host-based rules (`auth.` / `app1.` / `app2.`).
7. **DNS** — Route 53 records pointing the three subdomains at the ALB.
8. **Verify** — `curl https://auth.example.com/.well-known/jwks.json`; log in to get a token; call
   `https://app1.example.com/me` with it; confirm Flow B (app2 returns 403 for a tenant_a-only user).

### Hardening checklist (beyond the MVP)

HTTPS everywhere · private key in KMS, not on disk · least-privilege IAM (only IdP reads the key) ·
RDS not publicly accessible, encrypted at rest · security groups deny-by-default · ALB access logs ·
short token TTL kept · WAF on the ALB (optional) · rotate keys via `kid` (you already designed for it).

---

## 4. Phase 3b — Swap the IdP for Amazon Cognito (managed)

This is the "real companies do this" version. Your tenant apps barely change because they only depend
on an **issuer URL** and a **JWKS URL** — and Cognito provides both.

### Overall system picture

```
                       Internet (HTTPS)
                          │
                   ┌──────▼───────┐
                   │     ALB      │   app1.example.com → APP1   app2.example.com → APP2
                   └───┬──────┬───┘
       (option) ALB    │      │
       authenticate-   ▼      ▼
       oidc action  ┌──────┐┌──────┐         ┌─────────────────────────────┐
       offloads     │ APP1 ││ APP2 │ ──verify│  Amazon Cognito User Pool   │  = the IdP
       login to ───►│ EC2  ││ EC2  │  tokens │  • hosted login UI          │
       Cognito      └──────┘└──────┘  via    │  • issues OIDC id/access JWT │
                                JWKS ◄───────│  • /.well-known/jwks.json    │
                                             │  • Groups = entitlements     │
                                             │  • Pre-Token-Gen Lambda adds │
                                             │    `entitlements` claim      │
                                             └─────────────────────────────┘
                       Users + passwords now live in Cognito (managed, MFA-capable).
```

### How Cognito maps to the concepts you built

| Your MVP concept | Cognito equivalent |
|---|---|
| `auth-service` IdP | **Cognito User Pool** (hosted UI, OIDC authorization-code flow, refresh tokens) |
| `identities` table (users + password hashes) | **User Pool users** (AWS stores + hashes; MFA optional) |
| `entitlements` claim | **Cognito Groups** (or custom attributes), injected into the token by a **Pre-Token-Generation Lambda** trigger |
| `mint()` | Cognito issues the JWT; the Lambda trigger is where you customize claims |
| `verify()` + the 6 checks | **unchanged** in your apps — verify against Cognito's `iss`/`aud`, pin RS256, then check the `entitlements`/`cognito:groups` claim and the local user |
| JWKS endpoint | `https://cognito-idp.<region>.amazonaws.com/<userPoolId>/.well-known/jwks.json` |
| PKCE / consent / refresh (Phase 2) | built into Cognito's hosted flow |

### Two ways the apps consume Cognito

1. **App verifies tokens itself** (closest to what you built): the app receives the JWT and runs the
   same offline verification — only the issuer/JWKS URL changes. Best for *learning continuity*.
2. **ALB OIDC offload** (`authenticate-oidc` action): the ALB itself redirects unauthenticated users
   to Cognito, completes the OIDC handshake, and forwards identity headers to the app. The app does
   almost no auth code. Best for *seeing how little app code real setups need*.

### Setup walkthrough

1. Create a **User Pool**; add an **app client** for app1 and app2; enable the **hosted UI** and the
   **authorization-code + PKCE** flow; set callback URLs (`https://app1.example.com/callback`, …).
2. Create **Groups** (`tenant_a`, `tenant_b`) and assign users → this is your entitlements model.
3. Add a **Pre-Token-Generation Lambda** that maps a user's groups into an `entitlements` claim
   shaped like your Phase-1 token (`{ "tenant_a": ["member"] }`), so your apps' check #5 is unchanged.
4. Point each app's verifier at Cognito's issuer + JWKS URL (config only).
5. (Optional) Configure the **ALB `authenticate-oidc`** action to offload login entirely.
6. **Verify:** open `app1.example.com` → redirected to Cognito hosted UI → log in → back to the app's
   home page; open `app2.example.com` → already signed in (**SSO** via Cognito's session); a
   `tenant_a`-only user gets **403** at app2.

---

## 5. Cost & safety notes (for a study account)

- Most of this fits the **AWS Free Tier** for light use: 1 small RDS instance, t-class EC2, Cognito's
  free monthly active users, ALB (low hourly cost — the main charge). **NAT Gateway and the ALB cost
  per hour even when idle** — tear the stack down when not studying.
- Define everything as **infrastructure-as-code** so you can `destroy` and recreate cheaply.
- Set a **billing alarm** before you start.
- Use a throwaway domain (or Route 53's, or `*.elb.amazonaws.com` for HTTP-only experiments — but use
  a real ACM cert for anything with tokens).

## 6. Study materials

- **OAuth/OIDC core:** RFC 6749 (OAuth 2.0), RFC 7636 (PKCE), OpenID Connect Core — you already
  implement these in Phase 2; re-read with AWS in mind.
- **Cognito:** "Amazon Cognito Developer Guide" → User Pools, App clients, Hosted UI,
  Pre-Token-Generation Lambda trigger, "Verifying a JSON Web Token".
- **ALB OIDC:** "Authenticate users using an Application Load Balancer" (`authenticate-oidc`).
- **Networking:** "VPC with public and private subnets (NAT)" reference architecture.
- **Secrets/keys:** AWS Secrets Manager User Guide; AWS KMS "Signing and verifying with asymmetric
  KMS keys".
- **IaC:** AWS CDK (TypeScript — matches this repo) or Terraform; start from an ALB+ECS sample.
- **Well-Architected:** the Security pillar checklist — map each item to the hardening list above.

## 7. How Phase 3 fits the methodology

Phase 3 is **infrastructure**, so the "tests" shift from unit tests to **deployment verification**:
- Keep the Phase-1/2 app test suites green (the app code barely changes).
- Add **smoke/e2e checks** that run against the deployed stack (curl the JWKS URL, perform a login,
  call each app, assert Flow A/B/C results) — the same acceptance criteria, now over HTTPS in AWS.
- Capture each AWS decision as an **ADR** (e.g. "ALB terminates TLS", "private key in KMS",
  "Cognito groups as entitlements"), exactly as in Phases 1–2.

## 8. Suggested order

1. **3a-1:** VPC + RDS + one IdP EC2 behind ALB with ACM HTTPS; serve JWKS over HTTPS.
2. **3a-2:** add APP1 + APP2 EC2 (one image, two `TENANT_ID`s); reproduce Flows A/B/C over HTTPS.
3. **3a-3:** move the private key to Secrets Manager → then KMS signing; tighten IAM + security groups.
4. **3b-1:** stand up a Cognito User Pool + app clients + groups + Pre-Token-Gen Lambda.
5. **3b-2:** repoint the apps' verifier at Cognito; reproduce Flows A/B/C — now with a managed IdP.
6. **3b-3:** (optional) offload login to the ALB `authenticate-oidc` action and compare app code size.
