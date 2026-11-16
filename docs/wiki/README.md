# Nudge technical wiki

Nudge is a single-administrator utility that authenticates against portfolio APIs and calls a small endpoint that accesses MongoDB. It runs on Vercel Hobby with Turso Free. The application has no paid integrations, workers, queues, public registration or multi-user features.

This wiki describes the implemented system, its technical decisions and the procedures needed to maintain it. The source code and lockfile remain authoritative when behavior changes. The owner manually configured and tested the application successfully on November 15, 2026.

## Contents

| Page                                                                | Reference                                                            |
| ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [Setup and deployment](setup-and-deployment.md)                     | Local development, production configuration, migrations and releases |
| [Architecture](architecture.md)                                     | Components, dependencies, request flow and frontend assets           |
| [Data model and API](data-and-api.md)                               | Tables, REST routes, payloads and validation                         |
| [Project configuration](project-configuration.md)                   | Bearer/cookie login, endpoint selection, edits and manual checks     |
| [Execution and scheduling](execution-and-scheduling.md)             | Timeouts, Render cold starts, concurrency, leases and deduplication  |
| [Security](security.md)                                             | Administrator authentication, encryption, SSRF and secret handling   |
| [Operations and troubleshooting](operations-and-troubleshooting.md) | Routine maintenance, recovery and common failures                    |
| [Technical decisions](decisions.md)                                 | Why the current implementation works this way and when to revisit it |

## Current deployment

- Repository: [ednanf/nudge](https://github.com/ednanf/nudge).
- Git production branch: `main`; pushes trigger Vercel deployment.
- Runtime: Node.js 24, one Vercel Function, React/Vite static frontend.
- Storage: one Turso database, using the libSQL client.

Deployment URLs are intentionally omitted. A deployed alias is not automatically a trusted browser-write origin: the server accepts `APP_ORIGIN` and the project production domain supplied by Vercel. After changing the primary domain, confirm the origin configuration and redeploy; do not assume every historical Vercel alias can be used to sign in.

## Operating limits

| Setting                                      | Current value                                            | Owning source                                      |
| -------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| Projects per installation                    | 10                                                       | [server/config.ts](../../server/config.ts)         |
| Schedule                                     | Monday, 12:00 UTC / 09:00 São Paulo                      | [vercel.json](../../vercel.json)                   |
| Socket inactivity timeout                    | 75 seconds                                               | [server/http.ts](../../server/http.ts)             |
| Total HTTP check deadline                    | 90 seconds                                               | [server/runner.ts](../../server/runner.ts)         |
| Concurrent scheduled checks                  | At most 4                                                | [server/checks.ts](../../server/checks.ts)         |
| Vercel function duration                     | 300 seconds                                              | [vercel.json](../../vercel.json)                   |
| Execution lease expiry                       | 330 seconds                                              | [server/config.ts](../../server/config.ts)         |
| History retention                            | 90 days; latest 100 records returned                     | [server/checks.ts](../../server/checks.ts)         |
| Administrator session lifetime               | 7 days by default; 30 days when remembered, fixed expiry | [server/auth.ts](../../server/auth.ts)             |
| Login limit                                  | 5 attempts per global 15-minute bucket                   | [server/auth.ts](../../server/auth.ts)             |
| Incoming JSON body                           | 32 KB                                                    | [server/app.ts](../../server/app.ts)               |
| Authentication/keep-alive JSON configuration | 8,192 UTF-16 code units per serialized object            | [server/validation.ts](../../server/validation.ts) |
| Outgoing HTTP response body                  | 64 KB                                                    | [server/http.ts](../../server/http.ts)             |

Weekly checks are sufficient for the intended workload. The displayed next execution is an expectation; exact cron delivery time is not important to this application. A successful HTTP result does not prove MongoDB activity: the chosen portfolio endpoint must actually perform a database operation.

## Related documents

- [Project README](../../README.md): installation and usage overview.
- [Original specification](../specification.md): original requirements, not a record of current runtime details.
- [Verification notes](../verification.md): implementation test scope and historical checks.
- [Copyright notice](../../LICENSE).
