# Operations and troubleshooting

## Routine operation

After adding a portfolio application, run a manual check and confirm both the result and the endpoint's actual MongoDB operation. Leave its weekly switch enabled. Occasional review of failed checks is enough for the intended workload.

No notification, alert or email system exists. Nudge does not guarantee recovery from expired credentials, suspended hosting or a paused Atlas cluster without administrator intervention.

## Change an application credential

Open **Edit project** and enter the new disposable username or password. Leave other secret fields blank to keep them. Save, then run a manual check. Use `{}` to clear extra authentication JSON; a blank editor field preserves it.

## Change the administrator password

1. Run `npm run admin:hash` locally in an interactive terminal.
2. Choose the new password and copy the Argon2id hash into the production `ADMIN_PASSWORD_HASH` Secret.
3. Update the ignored operator configuration if maintaining a local production reference.
4. Redeploy.
5. Sign in with the original new password, not the hash.

Replacing the hash invalidates existing sessions. There is no public recovery endpoint or need to edit an administrator database row.

## Replace a Turso token or cron secret

Generate a replacement database token in Turso when needed, update `DATABASE_AUTH_TOKEN` in Vercel and the ignored operator configuration, and redeploy. Tokens must permit the database reads and writes used by the application. Nudge does not renew them automatically.

For a cron-secret change, generate a new random value of at least 32 characters, update `CRON_SECRET` and redeploy. Vercel cron delivery uses the deployment configuration. Do not place either secret in a URL, command argument, committed file or documentation.

## Backups and restoration

Keep a private backup of the database and its matching `ENCRYPTION_KEY`, plus the deployment configuration needed to reconnect. Nudge does not automate database backups or offer an export button. Use a backup/export procedure supported by your current Turso plan.

To restore an installation, restore the database, configure its URL/token and the matching encryption key, set the administrator hash and cron secret, then deploy and test. Expired sessions may remain in the restored data until cleanup; rotating the administrator hash invalidates them.

Do not casually replace `ENCRYPTION_KEY`. If it is lost, saved encrypted credentials cannot be recovered. Recover a matching backup or deliberately recreate affected projects with known disposable credentials. Merely editing a project still tries to decrypt its previous credential bundle.

## Common failures

| Symptom                                     | Check and action                                                                                                                                                                                          |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Request origin is not allowed.`            | Compare the browser URL with `APP_ORIGIN` and Vercel's assigned production domain. Only those exact production origins are accepted. Refresh after a deployment; do not fix this by allowing all origins. |
| `Incorrect administrator password.`         | Enter the plaintext password used to generate the configured hash. Confirm the production hash was preserved without shell expansion and the latest deployment received it.                               |
| HTTP 429 at login                           | The global five-attempt bucket is exhausted. Wait for the next fifteen-minute bucket; do not remove rate limiting to work around it.                                                                      |
| `Please sign in to continue.`               | Session expired, was revoked, belongs to another hostname, or was invalidated by an administrator-hash change. Sign in again.                                                                             |
| HTTP 409, another check running             | A manual test/check or cron owns the lease. Wait for completion. After a killed function, recovery can take up to the 330-second lease expiry.                                                            |
| HTTP 409, installation capacity             | The database contains ten projects. Remove an unused project rather than raising the cap without reviewing the function budget.                                                                           |
| Portfolio HTTP 401/403                      | Verify disposable account permissions, credential field names, extra login fields and the token/cookie configuration. This is separate from Nudge's own login.                                            |
| Portfolio HTTP 3xx                          | Configure the exact final HTTPS endpoint. Nudge deliberately does not follow redirects.                                                                                                                   |
| Invalid JSON or missing token               | Check whether the login endpoint returns JSON and whether its token path matches the response. A hosting startup page or HTML error page is not a valid token response.                                   |
| No valid authentication cookie              | Verify the login Set-Cookie domain/path/expiry and that a cookie is valid for the keep-alive endpoint.                                                                                                    |
| Socket or total timeout                     | Render may still be starting, or the application/database may be unhealthy. Allow the check to finish, inspect the portfolio service and retry manually. A cold start beyond the deadline can still fail. |
| Private/reserved destination error          | Use a public HTTPS API origin on port 443. Private network addresses and metadata endpoints are intentionally inaccessible.                                                                               |
| Response exceeds 64 KB                      | Use a smaller database-backed endpoint rather than a large listing or HTML page.                                                                                                                          |
| Stored credentials/configuration unreadable | Verify the encryption key matches the one used to save the project. Do not rotate keys as a troubleshooting shortcut.                                                                                     |
| Generic server/configuration error          | Check required environment names, Turso URL/token/permissions, schema initialization and deployment logs. Do not log secret values to diagnose it.                                                        |
| `ERR_MODULE_NOT_FOUND` on Vercel            | Check server-relative imports use `.js` and run the NodeNext type check. Development loader behavior is not proof of production compatibility.                                                            |
| Old labels, logo or tab title               | Reload the stable production URL after deployment. For a favicon cache, try a hard refresh or close/reopen the tab; confirm the icon URLs return image content rather than the SPA HTML fallback.         |

## A scheduled run is missing or incomplete

Check the production deployment first, then confirm cron is enabled and still points to `/api/cron` with `0 12 * * 1`. Check the cron secret and the project's enabled switch. Preview deployments do not run this production schedule.

`cron_runs.finished_at = NULL` means the run did not finish its bookkeeping; it does not necessarily mean every project failed. A later authorized invocation can process missing results. Already recorded failures are not retried by another invocation for the same slot.

Vercel does not guarantee automatic retry delivery. Nudge has no external retry service. A manual project check can be used after diagnosing a failure; it does not alter scheduled slot records.

Do not delete a live lease to force an overlapping run. Do not invoke cron just to inspect its status: it can contact every enabled portfolio API.

## Release and verification commands

From the source folder:

```sh
npm test
npm run build
npm run format:check
```

Tests use an isolated temporary SQLite database and mocked HTTP. They cover encryption, session/route protection, project CRUD, authentication mechanisms, SSRF classification, sanitization, weekly deduplication, concurrency and simulated cold starts. They do not destructively test real portfolio applications.

After a release, verify the intended commit is READY and exercise the affected flow. A safe signed-out API startup probe is `GET /api/auth/session`; checking `GET /api/projects` without a session should return 401. Neither invokes portfolio APIs.

Authenticated setup tests and manual checks do perform real portfolio requests. Use the disposable account and a harmless endpoint, and let the owner validate application-specific database behavior.

## Maintenance rules

- Preserve the matching encryption key when restoring data or moving deployments.
- Keep production and development databases separate.
- Add numbered SQL changes with an explicit migration apply step.
- Keep server ESM imports compatible with emitted JavaScript.
- Change timeouts, concurrency, lease expiry and project capacity as one budgeted decision.
- Keep source and generated favicon assets in sync.
- Update the canonical Wiki source in the same commit when routes, schema, limits or operating procedures change. Confirm the post-deployment Wiki workflow succeeds. If it fails, re-run it after correcting the problem; check the published source SHA in the Wiki footer.
- Stay on Vercel Hobby and Turso Free; no automatic paid upgrades are part of this project.
