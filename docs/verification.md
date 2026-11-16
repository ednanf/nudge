# Verification

Initial local checks and subsequent deployment verification were performed on 2026-11-15 with Node.js 24. The automated suite uses a temporary local database; deployment checks use the configured production installation without publishing its addresses or credentials.

## Automated coverage

The test suite covers:

- AES-GCM round trips, IV uniqueness, authentication-tag tampering, wrong keys and cross-project blob swapping.
- Private/reserved/metadata IPv4 and IPv6 rejection, mixed public/private DNS and HTTPS restrictions.
- Configuration defaults, endpoint origin escape rejection, ambiguous credential fields and invalid payloads.
- Mocked bearer authentication with nested tokens and JSON POST keep-alive.
- Mocked cookie authentication with domain, path and expiry restrictions.
- Non-2xx failures, redirect refusal, invalid/missing tokens and raw-error sanitization.
- Protected routes, login, logout, session expiration, admin-hash rotation, Secure cookie attributes and origin checks.
- Optional thirty-day remembered sessions, matched cookie/database expiry, rejection of non-boolean flags, unchanged seven-day defaults and revocation of remembered sessions.
- Project CRUD, encrypted usernames/passwords, secret-free API responses and preserved passwords on edit.
- Manual failure persistence and unsaved tests without history writes.
- Persisted execution leases, overlap rejection and stale lease recovery.
- A four-check scheduled pool that drains all projects while retaining the cross-invocation lease.
- A simulated 65-second authentication cold start and a stalled operation aborted at the 90-second total deadline.
- Cron secret validation, disabled-project exclusion, duplicate suppression, failure isolation and partial-run resumption.
- Ten-project storage cap, retention, persisted login rate limits and UTC schedule boundaries.

## Browser flow

A separate local QA environment with a temporary SQLite database was used to verify sign-in, project creation, unsaved connection tests, manual checks, saved failure history, editing without re-entering credentials, schedule switches, logout and activity-log rendering. The final orange/amber palette was visually checked and the browser console had no warnings or errors. Desktop and mobile layouts were inspected, including the configuration dialog. A floating-legend layout defect found in the mobile form was fixed and visually rechecked.

No production credentials were used. The seeded success/failure display examples are synthetic; the browser's actual manual check used a private address to verify safe rejection before network access. Successful external authentication is exercised with mocked HTTP responses in the automated suite.

## Deployment verification

The application has been deployed to Vercel with Turso. Post-deployment checks verified API routing, native Argon2 loading, unauthenticated route protection, authenticated database reads with a temporary session, and cron authorization with an empty batch. The test session and temporary automation bypass were revoked. The owner subsequently configured and manually tested portfolio operations successfully.

The weekly cron configuration was confirmed installed. An authorized manual endpoint check is not evidence of delivery of a future scheduled Monday invocation; automatic delivery remains an operational check in the dashboard.

HTTP success does not prove database access. Confirm the selected endpoint's MongoDB operation separately. Weekly scheduling, capped project count, bounded requests and free-plan features are designed for occasional personal use; provider availability and future plan changes are outside the application.
