# Fast Wallet — Secure Digital Wallet

`FastWallet.in` · card deposits credited **only** by verified provider webhooks · BEP20/TRC20
withdrawals · exact decimal ledger · role-protected administration.

Fast Wallet is a production-grade full-stack wallet: a React client that speaks to a REST API
over secure HTTP-only cookie sessions, backed by PostgreSQL with atomic, idempotent financial
operations. Every registed user starts at **zero**; funds appear only after a payment is
provably confirmed server-side.

---

## Architecture

| Concern | Implementation |
|---|---|
| Frontend | Next.js/React client (`src/app`), Tailwind v4, RHF + Zod, Recharts |
| REST API | Route handlers as thin controllers (`src/app/api`) |
| Backend layer | `src/server/` — services, middleware (auth/RBAC/rate-limit), validators, utils |
| Database | PostgreSQL + Drizzle ORM (`DATABASE_URL`) |
| Payments | Stripe Checkout + **signed webhook** (`payment.service.ts`) |
| Email | Resend when `RESEND_API_KEY` is set; otherwise logged server-side |

```
src/
├── app/                  # pages + REST controllers
│   ├── (auth)/           #   login, register, forgot/reset password
│   ├── (app)/            #   dashboard, transactions, withdrawals, settings, admin
│   └── api/              #   auth, wallet, deposits(+checkout), withdrawals,
│                         #   transactions, users, admin, payments/stripe/webhook
├── components/           # UI library, shell, wallet modals, charts
├── contexts / hooks / lib# auth+toast, api clients (axios), shared types
├── server/
│   ├── services/         # auth, wallet, deposit, checkout, payment (stripe),
│   │                     # withdrawal, transaction, user, admin
│   ├── middleware/       # authenticate / requireAdmin / rate limiter
│   ├── validators/       # zod — server-side truth
│   └── utils/            # decimal money, crypto, csv, mailer, audit, ApiError
├── db/                   # drizzle schema + client
└── scripts/              # create-admin.ts (CLI), e2e-payment-flow.ts
```

## Quick start

```bash
npm install
cp .env.example .env          # fill in DATABASE_URL, SESSION_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD

# create / repair the database schema (idempotent, additive — never drops data)
npm run db:setup              # then `npm run db:check` verifies it at any time

npm run dev                    # http://localhost:3000
```

> **If register/login return an error right after setup**, the tables almost certainly do not exist in the
> database that `DATABASE_URL` points at. `GET /api/health` reports `SCHEMA_DRIFT` (with the missing
> tables/columns in development) and the API answers `503 DATABASE_SCHEMA_MISSING`. Run `npm run db:setup`.
> (`drizzle.config.ts` now reads `DATABASE_URL`; it used to be hard-coded to localhost, so `drizzle-kit push`
> never reached a remote database such as Neon.)

### Tests

```bash
npm test                                   # unit tests
npm run test:e2e                           # auth flow against a running server (register/login/logout/RBAC/admin)
npx tsx scripts/e2e-admin-flow.ts          # admin control plane (real DB)
npx tsx scripts/e2e-payment-flow.ts        # verified-deposit pipeline (real DB)
```

| Command | Purpose |
|---|---|
| `npm run dev` | Start frontend + API (single process, port **3000**) |
| `npm run build` / `npm run start` | Production build / serve |
| `node --import tsx --test tests/*.test.ts` | Unit tests (money math, validators, webhook signatures) |
| `npx tsx scripts/e2e-payment-flow.ts` | DB-backed assertions for the whole crediting pipeline |
| `npx tsx scripts/create-admin.ts <email> <password>` | Provision the first administrator (CLI only) |

### The single administrator (env-pinned, always recoverable)

> Security notes: the **environment is the only source of truth** for the admin password — the stored
> hash is never accepted for `ADMIN_EMAIL`, so rotating `ADMIN_PASSWORD` instantly invalidates the old
> password and revokes the admin's existing sessions. `ADMIN_EMAIL` can **not** be claimed through public
> `/register` (it answers `EMAIL_TAKEN`). The admin password is changed only by editing the env var.
> Blank or invalid `ADMIN_*` values never break normal sign-in; they disable the admin credential and log why.

Exactly **one** admin account is possible platform-wide, pinned by two environment variables —
change them anytime in Vercel:

```
ADMIN_EMAIL      # e.g. you@fastwallet.in
ADMIN_PASSWORD   # e.g. your chosen password (min 8 chars)
```

**How it works** (all verified live):

1. **First login creates the account automatically** — no CLI needed. The user is created with
   `super_admin` role and an empty wallet the first time `ADMIN_EMAIL` + `ADMIN_PASSWORD` are
   submitted to the login form.
2. **Changing the password is just an env edit.** Set a new `ADMIN_PASSWORD`; the next login
   with it automatically rolls the stored hash to the new one and works immediately.
3. **Env credential always rescues the account** — even if the DB password drifted, the role
   was downgraded, or the account was suspended/banned, signing in with the env password
   re-grants access and restores `active` + `super_admin`.
4. `requireAdmin()` still demands `role=admin` **and** the email matching `ADMIN_EMAIL` on
   every request — a database `role` alone is never sufficient.

The secrets never touch the browser or API responses; they exist only as server-side env vars.
The CLI `npx tsx scripts/create-admin.ts` remains available as a manual override and refuses
any other email.

```bash
# 1. set ADMIN_EMAIL=you@fastwallet.in in the environment
# 2. create the account from a trusted shell
npx tsx scripts/create-admin.ts you@fastwallet.in 'A-Strong-Password1'
```

Enforcement is layered so a stray `admin` row can never grant access:

- `requireAdmin()` demands `role=admin` **and** an email equal to `ADMIN_EMAIL`.
- Every login reconciles roles: the designated email is promoted, any other admin is demoted.
- `publicUser()` never reports `admin` to the client unless the email matches.
- `create-admin.ts` refuses to target a different email and demotes stale admins.

### Admin control plane

| Area | What it does |
|---|---|
| **Overview** | Live DB aggregates: users by state, wallet liabilities, deposits/withdrawals, admin credits, payment events, alerts, daily cash-flow chart, recent transactions and admin actions. Day/week/month ranges. |
| **Approvals** | Single queue of every pending deposit and transfer, with inline approve/reject. |
| **Wallet adjustments** | Manual credit/debit: user search → amount (any positive value incl. `$1.00`/`$0.50`) → reason → funding classification → internal note → **confirmation screen showing the resulting balance** → atomic apply. |
| **Users** | Search, profile detail, suspend/ban/reactivate, deposit/withdrawal restrictions, force logout, password-reset email, email-verification toggle, internal notes & risk flags, delete, CSV export. |
| **Deposits / Withdrawals** | Full queues with provider/tx references, review with mandatory reasons. |
| **Ledger** | Read-only immutable explorer: debit/credit columns, balance-after, references, filters (user, type, status, min amount, dates), duplicate-reference anomaly detection, CSV export. |
| **Settings** | Runtime policy: enable/disable deposits & withdrawals, min/max amounts, fees, daily limits, maintenance messages, dual-approval threshold, negative-balance policy, alert thresholds, notification switches. Every change records previous → new value + reason. |
| **Security** | Alert feed (failed-login bursts, duplicate ledger references) with severity, investigate/resolve workflow and an on-demand scan. |
| **Audit log** | Every privileged action, immutable and searchable. |

#### Wallet adjustment guarantees

- Balance change **and** ledger row **and** audit entry commit in one PostgreSQL transaction.
- Ledger types are distinct: `admin_credit` / `admin_debit` with their own `adjc:` / `adjd:` reference namespace — never confused with provider receipts.
- Idempotency keys (unique index) make retries safe; duplicates return the original record.
- Debits are guarded in SQL (`available >= amount`) so concurrency can't overdraw; negative balances are blocked unless explicitly enabled in settings.
- Adjustments ≥ `highValueAdjustmentThreshold` enter `pending_approval` and **move no money** until a *different* administrator approves (self-approval is rejected).
- Admins cannot adjust their own wallet.
- `fundingSource` records whether a credit is cash-backed; the dashboard reports non-cash-backed credits separately so **wallet liabilities are never presented as revenue**.
- The affected user is notified in-app with amount, reason, timestamp and reference.

#### Roles & permissions (server-enforced, deny by default)

`super_admin` (all) · `finance_admin` (adjustments, approvals, ledger, reports) · `support_admin` (users, sessions, notes) · `compliance_reviewer` (risk, security, exports) · `auditor` (read-only).
Every protected route calls `requirePermission(...)`, which re-reads the role from the database-backed session. Hiding UI buttons is cosmetic only. Role assignment is never writable from any user-facing endpoint; `ADMIN_EMAIL` is always `super_admin`.

### Customer management (admin only)

- **Approvals tab** — one queue with every pending deposit and transfer, approve/reject inline.
- **Block / unblock** — blocking revokes all sessions immediately and rejects further logins
  with `ACCOUNT_BLOCKED`; balances and history are preserved.
- **Delete** — type-to-confirm permanent removal; user, wallet, deposits, transfers and ledger
  rows cascade, and access ends instantly. Admins cannot block or delete their own account.
- Every action is written to `audit_logs` before it takes effect.

## Payments: how deposits credit (and how they can't)

1. **Card top-up** — `POST /api/deposits/checkout` persists a deposit intent
   `(userId, idempotencyKey)`-unique and redirects to Stripe Checkout. Nothing else happens here.
2. Stripe calls `POST /api/payments/stripe/webhook`; the raw body is verified with
   `stripe.webhooks.constructEvent` against `STRIPE_WEBHOOK_SECRET` — **a bad or missing
   signature is a flat 400/503 with zero effects.**
3. Only then, inside one DB transaction: the event is recorded in `payment_events` (PK = event
   id ⇒ exact replay shield), the charged amount is compared **cent-exact** to the intent
   (mismatch ⇒ rejected, no credit), the request flips `pending → approved` conditionally, the
   wallet increments atomically, and a ledger row with unique reference `stripe:{session_id}`
   is inserted (`ON CONFLICT` ⇒ abort). A `$20` payment credits exactly `$20.00000000`, once.
4. `checkout.session.expired` closes the intent as cancelled; unpaid async sessions wait.
5. Returning to the site (success URL) only schedules balance refreshes — **the return URL
   cannot and does not credit anything.**

### Amount limits (no hardcoded minimums)

The old `$8`/`$10` floors are gone from schemas, services, API handlers and UI. Zod validates
*shape* only (positive, ≤ 8 decimals, ≤ 1,000,000); the **effective** minimum/maximum, daily
velocity limits, fees and maintenance switches live in `platform_settings` and are enforced in
`limits.service.ts`, so the API and UI always share one configuration. Defaults: min deposit
**1**, min transfer **5**.

Card payments additionally honour Stripe's real minimum charge (**0.50 USD**): a smaller amount
returns `BELOW_PROVIDER_MINIMUM` with a plain explanation rather than silently changing it.

### Deposits (BEP20 only)

Users send USDT on **BNB Smart Chain** to the official address, paste the **transaction hash**
and the amount, then submit. A unique index on `deposit_requests.tx_reference` guarantees a
hash can be claimed **once platform-wide** (even across different accounts). Nothing is
credited until the administrator verifies the hash in the approvals queue — then the atomic,
audit-logged credit path runs.

### Transfers / withdrawals (BEP20 only)

Quick-select amounts (**5 · 10 · 15 · 50 · 100 · 200 · 300**) or a custom amount, with an
optional BEP20 payout address. Pressing **Generate transfer code** debits amount + fee from the
wallet in one atomic transaction (balance guard in SQL) and returns a unique, human-readable
code such as `FW-SEQC-NCUB` (unambiguous alphabet, unique index). The funds stay reserved until
an admin approves the transfer; cancelling or rejecting restores them instantly.

## Security checklist

- bcrypt password hashing; HMAC-SHA256'd session & reset tokens; HTTP-only `SameSite` cookies
  (`Secure` in production); sessions invalidated on logout / password change / reset.
- Rate-limited login/register/forgot/reset and financial mutations (fixed-window, per IP+scope).
- Zod validation on every input, client *and* server; per-network address formats for payouts.
- RBAC: every `/api/admin/*` re-checks `role=admin` from the session — the UI merely hides links.
- Decimal money (`numeric(28,8)` + decimal.js); balance guards live in SQL `WHERE` clauses, so
  concurrent withdrawals cannot over-reserve and racing reviews cannot double-credit.
- Reset tokens are never exposed in production API responses; email delivery pluggable via
  `RESEND_API_KEY`.

## Deployment on Vercel

1. Deploy the repository as-is (Next.js; single process serves UI + API on port 3000).
2. Configure env vars: `DATABASE_URL` (pooled Postgres recommended), `SESSION_SECRET`,
   `ADMIN_EMAIL` (the one and only administrator), `NEXT_PUBLIC_APP_URL=https://fastwallet.in`,
   `COOKIE_SECURE=true`, `DEPOSIT_ADDRESS_BEP20`, optionally `RESEND_API_KEY` and
   `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`.
3. Run `npx drizzle-kit push` once against the production database.
4. In the Stripe dashboard register the webhook:
   `https://fastwallet.in/api/payments/stripe/webhook`
   with events **`checkout.session.completed`** and **`checkout.session.expired`**,
   then copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
5. Provision the first admin with `scripts/create-admin.ts`.
6. `fastwallet.in` / `www.fastwallet.in` need no code changes — cookies are host-scoped and
   all absolute URLs derive from `NEXT_PUBLIC_APP_URL`.

## Remaining manual setup

| Item | Where |
|---|---|
| Stripe keys + webhook registration | Stripe dashboard → env vars on Vercel |
| Domain connection (FastWallet.in) | Vercel domains |
| `RESEND_API_KEY` for real email | Resend dashboard |
| Crypto deposit addresses | Vercel env (`DEPOSIT_ADDRESS_*`) — UI hides them when blank |
| First admin account | `npx tsx scripts/create-admin.ts` |

## Verification summary (this build)

- `tsc --noEmit` 0 errors · `next build` ✅ · unit tests **14/14** ✅
- `scripts/e2e-payment-flow.ts`: exact $20 credit, replay blocked twice (event-level and
  session-level), manipulated amount rejected, expired/unpaid never credit, every ledger row
  unique ✅
- Live API acceptance: register→role user + zero balance, session persists, admin APIs 403 for
  users, duplicate email 409, role-injection discarded, unkeyed checkout answers an honest 503
  (no fake flow), bad-signature webhook rejected, zero-balance withdrawal refused, logout
  invalidates the session ✅
