# Setup and deployment

## Local development

Use Node.js 24 and npm. A local SQLite file is enough for development; no hosted database is required.

```sh
cd ~/Projects/nudge
npm ci
cp .env.example .env
npm run admin:hash
openssl rand -base64 32
openssl rand -hex 32
```

The administrator helper asks for a password without echoing it. It requires an interactive terminal and a password of 12–1024 characters. Put its Argon2id output in `ADMIN_PASSWORD_HASH`. Enter the original password, not the hash, on the login page. The optional **Remember me for 30 days** checkbox creates a thirty-day session; otherwise the session lasts seven days.

Use the base64 output for `ENCRYPTION_KEY` and the hex output for `CRON_SECRET`. Keep the administrator hash in single quotes in environment files so its `$` characters remain literal. Never put a password in a shell command or commit a populated environment file.

```sh
npm run db:migrate
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Vite serves the frontend and proxies `/api` to the local Node HTTP adapter on loopback port 3001. Node watch mode restarts the backend when its dependencies change; Vite handles frontend updates. Stop development with Ctrl+C.

## Environment reference

| Variable              | Meaning                                                     | Production handling                       |
| --------------------- | ----------------------------------------------------------- | ----------------------------------------- |
| `DATABASE_URL`        | `file:./nudge.db` locally; a `libsql://` Turso URL remotely | Vercel Secret                             |
| `DATABASE_AUTH_TOKEN` | Token authorized for this Turso database                    | Vercel Secret; unused for local SQLite    |
| `ADMIN_PASSWORD_HASH` | The single administrator's Argon2id hash                    | Vercel Secret                             |
| `ENCRYPTION_KEY`      | Exactly 32 random bytes in canonical base64                 | Vercel Secret; keep an independent backup |
| `CRON_SECRET`         | Random string of at least 32 characters                     | Vercel Secret                             |
| `APP_ORIGIN`          | Exact trusted browser origin                                | Vercel Config; HTTPS in production        |

The [template](../../.env.example) contains placeholders only. All private values remain server-side; do not use `VITE_` prefixes for them.

`VERCEL_ENV` and `VERCEL_PROJECT_PRODUCTION_URL` are platform configuration, not application secrets. In production, origin validation also accepts the exact project production domain supplied by Vercel. It does not accept arbitrary preview hosts or all `*.vercel.app` domains.

No `SESSION_SECRET` is required because sessions use random tokens stored as hashes in Turso.

## Separate environments

- `.env` is the local development configuration used by the npm scripts.
- `.env.production.local` is an ignored operator-maintained file used for this installation's production setup. It is not automatically loaded by `npm run dev` or `npm run db:migrate`.
- `.env.local` may be written by the Vercel CLI. The local npm scripts do not automatically load it.
- Production Vercel Secrets are separate from local files. Editing a local file does not update Vercel; upload the changed values and redeploy.
- Preview deployments should use their own database, origin and secrets. Do not give them the production database by default.

Both [.gitignore](../../.gitignore) and [.vercelignore](../../.vercelignore) exclude populated environment files, local databases and build/dependency directories. `.env.example` is intentionally tracked in Git.

## Database initialization

The [migration script](../../scripts/migrate.ts) explicitly applies [001_initial.sql](../../migrations/001_initial.sql). It is idempotent and is not run automatically during builds or HTTP requests.

For local development:

```sh
npm run db:migrate
```

For the production values already stored in the ignored operator file:

```sh
node --env-file=.env.production.local --import tsx scripts/migrate.ts
```

Verify the target database before running a migration. Production functions reject local `file:` database URLs; Vercel's filesystem is not persistent storage.

The script currently applies only migration 001. New numbered files are not discovered automatically: future schema changes must add an explicit apply procedure or extend the runner. Back up the target database before changing its schema.

## Vercel deployment

The repository is connected to the `nudge` project on the owner's Hobby account. `main` is the production branch.

Configuration is stored in [vercel.json](../../vercel.json): Vite, `npm run build`, output in `dist`, one Node Function with a 300-second maximum, API rewrites and a weekly cron. Use Node.js 24 with Fluid Compute. Do not enable paid compute, integrations or extra infrastructure.

For a fresh installation:

1. Create a Turso Free database and database-scoped token.
2. Apply the initial migration to that database.
3. Import the repository into a Vercel Hobby project.
4. Configure the six application variables for production. Generate fresh encryption and cron keys for a new installation.
5. Set `APP_ORIGIN` to a stable production URL.
6. Deploy and verify the login page, sign-in, project creation and a manual check.
7. Confirm `/api/cron` is installed with `0 12 * * 1`.

For subsequent changes:

```sh
npm test
npm run build
npm run format:check
git add <changed-files>
git commit -m "Describe the change"
git push origin main
```

`npm run build` includes both frontend TypeScript and NodeNext server checks. Check that Vercel reports the intended commit as READY, then verify affected functionality on the stable production domain. A READY build alone does not prove runtime health.

Set secrets through the Vercel dashboard or the authenticated CLI, using stdin rather than command arguments for secret values. With current CLI versions, `vercel env add NAME --environment production --type secret` reads a piped value. Confirm the linked team/project before any mutation; upload changed values and redeploy so the new deployment receives them.

For this deployment, the owner has already completed a manual application configuration and test. Future changes still need checks appropriate to the affected behavior.

## Free-tier references

Provider terms can change. The app's design was checked against these sources on November 15, 2026:

- [Vercel cron usage and pricing](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing): the weekly schedule fits Hobby restrictions.
- [Vercel function limits](https://vercel.com/docs/functions/limitations): Hobby's Fluid Compute maximum is 300 seconds.
- [Turso Free pricing](https://turso.tech/pricing): one small database uses no paid features.
- [Render Free service behavior](https://render.com/docs/free#spinning-down-on-idle): allow for service cold starts.

The application does not provision services, upgrade plans or purchase anything through its setup scripts.
