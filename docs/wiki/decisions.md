# Technical decisions

These records explain the current implementation. They are not a list of unapproved future features. Revisit a decision only when a concrete requirement changes its tradeoffs.

## 1. One small application on free tiers

**Decision:** React/Vite static frontend, one Node.js Vercel Function and one Turso Free database.

**Reason:** The workload is a handful of authenticated API calls each week and occasional administration. A server, worker fleet, queue, external cache or paid monitoring platform would add maintenance without helping the primary objective.

**Consequence:** Function runtime and provider free-plan limits shape project capacity and execution budgeting. There is no continuous monitoring, alert delivery or independent durable worker.

## 2. Plain SQL and one relational store

**Decision:** Use `@libsql/client`, parameterized SQL and a small explicit schema; no ORM.

**Reason:** The database needs simple projects/history queries and a few atomic constraints. The same store can persist sessions, rate limits, execution leases and cron bookkeeping across ephemeral function instances.

**Consequence:** Queries and migration steps remain visible in source. The initial runner applies only migration 001; future files require an explicit runner/apply change. In-memory maps cannot replace shared session, rate-limit or lock state.

## 3. Single administrator configured outside the UI

**Decision:** One Argon2id hash supplied through server configuration, opaque database-backed sessions, no registration/recovery/account management.

**Reason:** There is one owner. An authentication framework, roles and account lifecycle would enlarge the application without serving its use case.

**Consequence:** The operator changes the password through a new hash and deployment. A global persisted login limit is intentionally simple and can temporarily block the owner when exhausted. Multiple active browser sessions are allowed, but there are no additional accounts.

## 4. Hash administrator passwords; encrypt recoverable credentials

**Decision:** Argon2id for the administrator password, AES-256-GCM for portfolio usernames, passwords and extra login JSON.

**Reason:** The admin password only needs verification. Portfolio passwords must be recovered for automatic authentication. A fresh IV and project-ID authenticated data protect each saved credential bundle.

**Consequence:** The encryption key is required for restoration and is not interchangeable with a session secret. Losing it loses recoverability of saved credentials. Automatic encryption-key rotation is not implemented.

## 5. Configurable HTTP pair rather than a workflow engine

**Decision:** One JSON login request followed by one GET/POST database-backed request, using a bearer token or scoped cookies.

**Reason:** This accommodates common existing portfolio APIs without requiring code changes in every application. A script engine or general workflow builder would create a larger product and security boundary.

**Consequence:** Flat credential field names, dot-path token extraction and optional JSON bodies are supported. OAuth, multi-step CSRF/MFA, arbitrary headers, browser automation and persistent refresh sessions are outside scope.

## 6. Strict destinations and no redirects

**Decision:** Public HTTPS on port 443, same-origin endpoint paths, all DNS addresses checked, validated IP pinned into TLS, no redirects.

**Reason:** The server holds recoverable credentials and must not forward them to private infrastructure or a redirected destination. A DNS-only preflight without pinning leaves a rebinding gap.

**Consequence:** Administrators must configure final canonical API endpoints. Private/local portfolio instances cannot be checked through this production runner. Cookie scope is enforced through a real cookie jar.

## 7. Weekly cadence, without precise-time infrastructure

**Decision:** Monday at 12:00 UTC using Vercel Cron Jobs and a separate secret.

**Reason:** Atlas inactivity is measured over weeks; a weekly request gives substantial margin. The exact hour does not justify more infrastructure or a paid plan.

**Consequence:** The UI shows an expected execution time rather than promising exact delivery. There are no per-project schedules, workers, automatic alerts or external retry schedulers.

## 8. Longer cold-start tolerance with bounded concurrency

**Decision:** A 75-second socket inactivity limit, 90-second total check deadline, four concurrent cron workers and a ten-project cap.

**Reason:** The original 8/20-second limits could not accommodate Render Free services taking about a minute to start. Raising timeouts while leaving all ten checks sequential would exceed the Hobby function budget.

**Consequence:** Ten projects need at most three HTTP waves, budgeted at 270 seconds inside a 300-second function. Database latency can still exhaust the remaining margin. Do not increase the cap or deadlines independently. Manual and unsaved checks use the same runner.

## 9. Database lease and weekly result uniqueness

**Decision:** A 330-second global lease across execution invocations, plus unique `(project_id, slot)` scheduled results and a completed-run marker.

**Reason:** Serverless instances do not share memory, and cron delivery can be duplicated. The lease outlives the maximum function lifetime. Workers are all settled before release even when one encounters a database error.

**Consequence:** Concurrent invocations receive 409. A killed invocation can temporarily leave a lease behind. Recorded failures are not retried by same-week cron duplicates. A crash between a remote operation and its result insert can still repeat the remote operation, so endpoints must be safe to repeat.

## 10. Explicit ESM compatibility checks

**Decision:** Server-relative imports name `.js` output files, and builds include a NodeNext server type check.

**Reason:** Extensionless imports worked locally with the TypeScript loader but caused an actual `ERR_MODULE_NOT_FOUND` startup failure on Vercel.

**Consequence:** Frontend compilation alone is insufficient. Preserve the server-specific tsconfig and verify runtime startup after deployment.

## 11. Trust exact production origins

**Decision:** Accept `APP_ORIGIN` and, only in production, the exact domain supplied by `VERCEL_PROJECT_PRODUCTION_URL`.

**Reason:** Vercel assigned two production hostnames; accepting only the manually configured URL blocked legitimate login from the other hostname. Trusting every Vercel host or reflecting request headers would weaken origin validation unnecessarily.

**Consequence:** The configured origin and current Vercel-supplied production origin work. Adding a custom primary domain can change the latter; historical deployment aliases are not automatically trusted. Other projects, preview hosts and lookalike suffix domains remain blocked. Cookies are still host-scoped.

## 12. Minimal UI and short-lived history

**Decision:** Plain React state and CSS, a responsive orange skeuomorphic interface, functional labels and status indicators only for actual states. Keep 90 days of history and return the latest 100 records.

**Reason:** The owner needs a compact administration tool, not a marketing page or analytics product. Extra slogans, edition badges and decorative status lights created clutter.

**Consequence:** No UI framework, external fonts, state library or analytics service. The wordmark has no trailing dot. SVG plus PNG/ICO/touch fallbacks provide explicit browser icons; contextual page titles identify the login and dashboard views.

## 13. Source-managed documentation and reserved rights

**Decision:** Keep the technical wiki in `docs/wiki`, link it from the README, and keep a root copyright notice with all rights reserved.

**Reason:** Architecture, contracts, decisions and operating procedures should version alongside implementation changes. A repository file is sufficient; no separate documentation platform is required.

**Consequence:** Documentation updates are ordinary Git changes. No open-source license is granted by publishing the private repository's technical documentation. Do not replace the copyright notice with a permissive license without the owner's instruction.
