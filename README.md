# Nudge

A little lift for your side projects. Internally: **Viagra** — keeping your connections up, one sensible request at a time.

Nudge is a private, single-admin utility that signs into your portfolio APIs with disposable accounts and calls an endpoint that reaches MongoDB. It runs weekly and keeps a short history. The dashboard is a responsive, skeuomorphic control panel built with CSS, without a UI framework or external fonts.

**Free tiers only:** Vercel Hobby + Turso Free. No workers, queues, paid integrations, email, accounts beyond your administrator, or analytics. Nothing is automatically provisioned or deployed by the setup scripts.

## Local setup

Requires Node.js 24 and npm. Local development uses a SQLite file; no cloud account is needed.

```sh
cd ~/Projects/nudge
npm ci
cp .env.example .env
npm run admin:hash
openssl rand -base64 32
openssl rand -hex 32
```

The password helper prompts without echo and outputs an Argon2id hash. Set `ADMIN_PASSWORD_HASH` to that output. Set `ENCRYPTION_KEY` to the base64 output and `CRON_SECRET` to the hex output. Store the values in `.env`, keeping quotes around the hash if your shell would interpret `$`. Use `DATABASE_URL=file:./nudge.db` and `APP_ORIGIN=http://localhost:5173` locally.

```sh
npm run db:migrate
npm run dev
```

Open [localhost:5173](http://localhost:5173). Sign in with the password you hashed; there is no username, registration, recovery, or default password. The API listens on loopback port 3001; Vite proxies `/api`. The frontend and API use the same handler as production.

The database starts empty. No sample credentials or secret-bearing `.env` file are included. The development password helper is designed for a terminal on macOS/Linux; run it interactively rather than passing the password in command arguments.

## Configuration

All variables are server-only. Never prefix them with `VITE_`.

| Variable              | Value                                                                              |
| --------------------- | ---------------------------------------------------------------------------------- |
| `DATABASE_URL`        | `file:./nudge.db` locally; `libsql://...` from Turso in production                 |
| `DATABASE_AUTH_TOKEN` | Turso database token; unnecessary for a local file                                 |
| `ADMIN_PASSWORD_HASH` | Argon2id output from `npm run admin:hash`                                          |
| `ENCRYPTION_KEY`      | Exactly 32 random bytes encoded as canonical base64                                |
| `CRON_SECRET`         | Random secret of at least 32 characters                                            |
| `APP_ORIGIN`          | Exact browser origin, e.g. `https://nudge.example.vercel.app`; HTTPS in production |

No `SESSION_SECRET` is needed. Sessions are opaque random tokens; only their SHA-256 hashes are stored in the database. They expire after seven days and are revoked on logout. Changing the admin hash invalidates existing sessions. Login allows five attempts per 15-minute UTC bucket, globally across instances, intentionally shared for the one administrator. Cookies use HttpOnly and SameSite=Strict; Secure is mandatory on Vercel and HTTPS, omitted only for local HTTP.

## Database initialization and migrations

`npm run db:migrate` applies `migrations/001_initial.sql` to the database selected by your environment. It is idempotent and creates projects, checks, sessions, login limits, execution leases, cron runs, indexes and foreign keys. Run it once before first use; it is not run inside HTTP requests or automatically during builds.

For a remote database, temporarily point `DATABASE_URL` and `DATABASE_AUTH_TOKEN` at your Turso Free database in your local ignored `.env`, run the migration command, then restore your local development settings. Do not share production data with preview deployments.

Future schema changes should be new numbered SQL files with a documented apply step; do not rewrite an already applied migration. Back up a database before applying a schema change. Project deletion also deletes its execution history atomically.

## Deploy to Vercel Hobby

Perform these steps only when you are ready to provision and deploy:

1. Create one **Turso Free** database and a database token using Turso's dashboard or CLI. Apply the initial migration as described above. Use the existing libSQL-compatible connection URL provided by Turso.
2. Import this repository into a **personal Vercel Hobby** project. Use the Vite preset, Node.js 24, `npm run build`, and `dist` as the output directory. Keep Fluid Compute enabled.
3. Add the production environment variables listed above in the Vercel dashboard. Generate a new production encryption key and cron secret. Set `APP_ORIGIN` to your stable production domain, not a changing preview URL.
4. Deploy. `api/index.ts` is the single Node function; the API rewrite preserves the requested pathname. React's production assets are served statically. The function is configured for at most 300 seconds.
5. Sign in, add a project, and run a manual check. Confirm the result in Activity log and verify the chosen endpoint really accesses MongoDB using the portfolio application's code or database-side evidence.
6. In Vercel, verify the cron points to `/api/cron` with `0 12 * * 1`. Cron runs on **production deployments only**. Vercel supplies `Authorization: Bearer <CRON_SECRET>` automatically.

Do not enable paid upgrades or attach a paid service. This application is intended for personal, non-commercial Hobby use. Preview deployments need their own origin, database, and secrets if you choose to enable the backend there.

### Free-tier compatibility

Checked against official documentation on **2026-11-15**:

- [Vercel cron limits](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing): Hobby supports schedules no more frequent than daily. The weekly Monday schedule fits. Invocations may occur within the scheduled hour; the dashboard time is an expectation, not a deadline. Although Vercel now documents Schedules as a successor, this project retains the requested, supported Cron Jobs configuration.
- [Vercel function limits](https://vercel.com/docs/functions/limitations): with Fluid Compute, Hobby functions have a 300-second maximum. This app uses one function, at most **10 projects**, and **one check at a time**. Each check has a 20-second total HTTP deadline, an 8-second socket inactivity timeout and a 2.5-second DNS limit. This leaves margin for database operations; unusually slow database calls can still exhaust a function deadline.
- [Turso pricing](https://turso.tech/pricing): Free currently includes 100 databases, 5 GB storage, 500 million monthly row reads and 10 million monthly row writes. This app needs one database and a few weekly writes per project, plus dashboard/session activity. It uses no paid features.
- [Atlas free cluster limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/): Atlas pauses free clusters after 30 days without connections. Weekly database activity gives ample margin. Nudge cannot prove that a remote endpoint actually opened a MongoDB connection or restore an already paused cluster.

There is no guarantee of future provider pricing or availability. Keep the accounts on Free/Hobby and check their usage dashboards if you leave this running for a long time. One weekly job and occasional personal dashboard use are the intended workload.

## Add a portfolio application

1. Create a disposable, minimally privileged user in the existing application. Do not use your real admin account or an account with meaningful data.
2. Choose **Add project**. Enter a name and a public HTTPS API origin, such as `https://api.example.com` (no path). Put `/api` prefixes in the endpoint paths.
3. Set the login path and method (POST by default; PUT also supported), credential JSON field names, username/email, and password. Optional extra authentication JSON is merged with the credentials; configured credential fields take precedence.
4. Choose a bearer token and its dot-separated response path (`token`, `accessToken`, `data.token`), or cookie authentication. Cookies respect their domain, path, expiration and Secure attributes; there is no persistent cookie jar.
5. Choose a safe GET or POST keep-alive endpoint. A read such as `GET /api/me` is usually suitable **only if that route actually queries MongoDB**. Avoid logout, delete, purchase, email, or other side-effect endpoints. Optional POST JSON is supported.
6. Optionally **Test connection** before saving. This performs real requests with the disposable account but does not persist the configuration or history. Save, then **Nudge now** to record a check.

Saved usernames, passwords and extra authentication JSON are encrypted and never returned by the project API. Leave those fields blank while editing to retain them. Enter `{}` in additional authentication JSON to clear previous extra fields. Passwords are never displayed after saving. Endpoint paths and keep-alive JSON are ordinary configuration: keep secrets out of them.

The switch controls weekly inclusion. You can still manually check a disabled project. Removing a project also removes its history. History shows the latest 100 records; records older than 90 days are cleaned up during cron runs, successful sign-ins, and manual checks.

## Scheduling and reliability

The fixed schedule is Monday **12:00 UTC / 09:00 São Paulo** (`0 12 * * 1`). The dashboard converts expected and historical timestamps to the viewer's local timezone.

A database-backed lease serializes manual checks, unsaved connection tests and cron runs across function instances. Another execution returns HTTP 409 instead of starting overlapping work. A stale lease expires after 270 seconds. Database uniqueness on project/week prevents duplicate scheduled results. Repeated completed invocations do nothing; a repeated interrupted invocation resumes projects without recorded results. Remote operations cannot be exactly-once: if a process dies after an HTTP request but before recording its result, a retry may repeat it. Choose harmless endpoints.

Each project's authentication, network or configuration failure is stored and does not interrupt other checks. Database outages fail the invocation so an incomplete run can be retried manually. Vercel does not guarantee automatic cron retries, and this app does not add an external retry service. Review the dashboard if an application repeatedly fails or credentials change.

## Security and key backup

- Admin passwords are Argon2id hashes (19 MiB memory, two iterations, one lane). There is exactly one admin supplied by server configuration.
- Portfolio credentials use AES-256-GCM with a fresh 12-byte IV and an authentication tag per save. Project ID is authenticated additional data, preventing encrypted blobs being swapped between projects. Decryption happens only on the server.
- **Back up `ENCRYPTION_KEY` in your password manager alongside the database access details.** A database backup without its key cannot recover disposable credentials. Do not replace the key on an existing installation unless you re-enter every project's credentials. This small tool has no automatic key-rotation workflow.
- HTTPS on port 443 only; no redirects are followed. Every request resolves DNS and rejects non-public addresses, including private, loopback, metadata, reserved and IPv4-mapped IPv6 ranges. The validated IP is pinned into the actual TLS connection, while preserving hostname verification. All returned DNS addresses must be public.
- Responses are limited to 64 KB. Only safe, controlled failure descriptions are stored; response bodies, tokens, cookies and raw network exception messages are not logged.
- Every management/history route requires an active session. Browser writes additionally require JSON content type and an exact trusted origin: `APP_ORIGIN`, plus Vercel's project production domain (`VERCEL_PROJECT_PRODUCTION_URL`) only in production. Arbitrary request hosts, preview URLs and other Vercel projects are not trusted. Cron uses only its own secret and never a browser session.

There is no arbitrary JavaScript, workflow scripting, custom request headers, arbitrary ports, OAuth, CSRF-token login support, browser-based authentication, MFA automation, refresh-token persistence, or cross-origin login. These are intentional limits for a tiny utility. If a portfolio API uses one of those mechanisms, this initial version will not support it without a deliberate source change.

## Development and checks

```sh
npm test
npm run typecheck
npm run build
npm run format:check
```

Tests use a temporary SQLite database, synthetic credentials and mocked portfolio HTTP responses. They never contact real portfolio applications. The SSRF/manual failure integration case targets a loopback address and verifies it is rejected before a connection. See [verification notes](docs/verification.md) for scope and deployment limitations.

```text
src/                 React dashboard, editor, CSS and browser API client
api/index.ts         Vercel Web Request/Response entry point
server/app.ts        Small REST router, authorization and response boundary
server/auth.ts       Single-admin login, persisted sessions and rate limiting
server/projects.ts   Validated project storage and secret-preserving edits
server/http.ts       DNS validation, pinned HTTPS and response limits
server/runner.ts     Login → bearer/cookie → keep-alive
server/checks.ts     Execution lease, history, cron deduplication and retention
server/crypto.ts     AES-GCM encryption and token hashing
migrations/          Plain SQL schema
scripts/             Local server, migration and administrator hash helper
tests/               Focused security, runner and API tests
```

The original development brief is retained in [docs/specification.md](docs/specification.md).
