# Project configuration

## Choose a safe operation

Use a disposable, minimally privileged portfolio account with no meaningful user data. The keep-alive operation should be a small read, or another harmless request that the application is safe to repeat.

Choose an endpoint that genuinely reads or writes MongoDB. A cached response, static health endpoint or HTTP 200 response does not establish database activity. Confirm the behavior in the portfolio application's code or database-side evidence.

Do not use destructive operations, purchases, logout, email sending or large list endpoints. Nudge reads response bodies and rejects bodies larger than 64 KB.

## Add a connection

In **Add project**, enter:

| Field                     | Meaning                                                                        |
| ------------------------- | ------------------------------------------------------------------------------ |
| Project name              | Dashboard label, up to 80 characters                                           |
| Base API URL              | HTTPS origin only, such as `https://api.example.com`; no `/api` prefix here    |
| Login endpoint            | Absolute path such as `/api/auth/login`                                        |
| Authentication method     | POST by default; PUT is also supported                                         |
| Disposable username/email | Value sent in the configured credential field                                  |
| Disposable password       | Recoverable encrypted credential, distinct from the Nudge admin password       |
| Username JSON field       | `email` by default; use `username` or the application's actual flat field name |
| Password JSON field       | `password` by default; must differ from the username field                     |
| Authentication type       | Bearer token or session cookie                                                 |
| Token path                | Dot-separated response path such as `token` or `data.accessToken`              |
| Extra authentication JSON | Optional fields merged into the login body                                     |
| Keep-alive endpoint       | Same-origin path that performs the database operation                          |
| Keep-alive method         | GET or POST                                                                    |
| Keep-alive JSON           | Optional POST body; ignored for GET                                            |
| Weekly schedule           | Whether the cron includes this project                                         |

All endpoint paths must stay on the configured origin. Only public HTTPS destinations on port 443 are allowed. Redirects are failures, including same-origin redirects: configure the final endpoint rather than relying on redirection.

## Bearer authentication example

These are fictional endpoint and field names, not real project credentials.

Suppose the portfolio API accepts:

```json
{
  "email": "disposable@example.com",
  "password": "<disposable-password>"
}
```

and returns:

```json
{
  "data": {
    "accessToken": "<token>"
  }
}
```

Choose bearer authentication with token path `data.accessToken`. Nudge sends `Authorization: Bearer <token>` on the keep-alive request. It does not persist the extracted token.

Extra authentication JSON can supply required fields such as `{"audience":"portfolio"}`. The configured username and password values override matching keys in that object. Credential field names are flat keys; the token extraction path supports nested response objects.

## Cookie authentication

Nudge reads `Set-Cookie` headers from the login response and selects cookies valid for the keep-alive URL. Domain, path, expiration and Secure restrictions apply. A cookie scoped to `/auth` cannot authenticate a request to `/api/me` unless the application configures the appropriate scope.

The cookie jar exists only for that check. Nudge does not retain refresh sessions, follow OAuth redirects, automate a browser, solve challenges or perform multi-step MFA/CSRF-token login flows.

## Test and save

**Test connection** performs real authentication and keep-alive requests with the supplied account. It does not save the project or execution history. Sleeping services may make this take around a minute; the complete check has a 90-second deadline.

Save the project, then choose **Run check** to persist a result. The most recent result appears on its connection card, and the activity log shows timestamps, source, duration and sanitized errors.

## Edit without revealing secrets

Saved usernames, passwords and additional authentication JSON are encrypted and are not returned by project APIs. They are never prefilled into the editor after saving.

- Leave username or password blank to preserve the saved value.
- Leave extra authentication JSON blank to preserve its saved object.
- Enter `{}` to explicitly clear saved extra authentication fields.
- A newly entered password replaces the encrypted password; it is not displayed after saving.

Public endpoint configuration and keep-alive JSON are not encrypted. Do not place credentials, tokens or other secrets in them.

## Disable and delete

The switch controls inclusion in future weekly runs. A disabled project can still be checked manually. Disabling does not delete its history or necessarily cancel a check already in progress.

Deleting removes the project and its execution history in an atomic database batch. It does not delete or modify the disposable account in the portfolio application. Removal does not have an application-level undo facility.

The installation supports at most ten projects. That cap is enforced in the database insert, including concurrent create requests.
