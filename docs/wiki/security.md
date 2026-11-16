# Security

## Administrator authentication

There is exactly one administrator, defined by `ADMIN_PASSWORD_HASH`. No administrator row, registration route, roles, OAuth, recovery flow or email system exists.

The setup helper generates an Argon2id hash with 19,456 KiB of memory, two iterations and one lane. It enforces 12–1024 characters at setup. The login endpoint verifies a nonempty password up to 1024 characters against the server hash; the browser sends the original password over HTTPS, never the hash.

Rate limiting is database-backed and global: five attempts per fifteen-minute bucket across all function instances. It deliberately does not rely on client-supplied IP headers. Successful password attempts count too. Requests rejected for origin, content type or invalid/missing body before password verification do not reach the login counter. This is proportionate to one administrator; a sustained attacker can temporarily exhaust that shared budget.

## Sessions

Each login creates 32 random bytes, represented as a 64-character hex token. The browser gets `nudge_session`; the database stores only the token's SHA-256 hash. Cookies use HttpOnly, SameSite=Strict, path `/` and a seven-day Max-Age. Secure is enabled on Vercel or HTTPS, with a local-HTTP exception for development.

Server validation checks token format, stored hash, expiration and `admin_version`. The version is a digest of the configured Argon2id hash. Replacing `ADMIN_PASSWORD_HASH`, even with a new hash for the same plaintext password, invalidates existing sessions.

Session expiry is fixed at seven days and is not extended on every request. Logout deletes the active session and expires its cookie. Logging in also revokes an old session presented by that browser, but the system does not enforce a single concurrent browser session.

## Browser origin checks

Browser writes require JSON content type and an exact trusted Origin. The allowed set is:

- The normalized `APP_ORIGIN`.
- In `VERCEL_ENV=production`, the HTTPS origin derived from Vercel's `VERCEL_PROJECT_PRODUCTION_URL`.

This handles the two assigned production URLs without trusting arbitrary Vercel domains. Origin is not derived from an attacker-supplied Host/forwarded header. Missing, `null`, foreign, wrong-scheme, wrong-port and suffix-lookalike origins are rejected.

These checks apply to login and logout as well as project writes. Session cookies remain host-scoped, so signing in on one production hostname does not sign in the other hostname automatically.

Cron instead uses a timing-safe comparison with `Authorization: Bearer <CRON_SECRET>`. Keep that secret at least 32 characters long. Never send it from frontend code.

## Portfolio credential encryption

Passwords must be recoverable for automatic login, so the credential bundle uses AES-256-GCM rather than password hashing. The administrator password is the one that uses Argon2id.

Each save encrypts `{ username, password, authBody }` using a fresh random 12-byte IV. The project ID is authenticated additional data, so swapping encrypted blobs between projects fails authentication. The stored envelope contains:

```text
{ v: 1, iv: base64, tag: base64, ciphertext: base64 }
```

`ENCRYPTION_KEY` must decode to exactly 32 bytes and re-encode to the same canonical base64 string. Decryption happens only in server code. The public API never returns saved usernames, passwords, extra login JSON, ciphertext, tokens or session cookies in JSON responses.

Back up the encryption key independently of Vercel and the database. A database backup alone cannot recover the credentials. There is no key-rotation migration: replacing the key requires restoring the matching old key or deliberately recreating affected project credentials/configuration.

Ordinary endpoint configuration and keep-alive request bodies remain plaintext database configuration. Keep secrets out of URLs and keep-alive JSON.

## Outgoing request protections

Only HTTPS on port 443 is accepted. The runner keeps login and keep-alive paths on the configured origin. Redirects are never followed, even on that origin, so a redirect cannot forward credentials to an unexpected destination.

For every connection, DNS results are classified with `ipaddr.js`. All returned addresses must be public unicast. Private, loopback, link-local, metadata, reserved, mapped IPv6 and other special-use ranges fail closed. Local/internal hostnames and trailing-dot hostnames are also rejected.

The validated address is pinned in the actual HTTPS lookup callback. TLS hostname verification and SNI still use the original API hostname. This closes the gap between an initial DNS safety check and a second, potentially different DNS answer at connection time.

A request has bounded socket inactivity and a shared check deadline. Response bodies are limited to 64 KB. This applies even when the response body is not needed for the keep-alive result.

Cookie authentication uses `tough-cookie` instead of manually concatenating all Set-Cookie headers. Cookies must be valid for the keep-alive URL; the jar is discarded after the check.

## Logging and delivery

External response bodies, decrypted secrets, bearer tokens, session cookies and raw network exception messages are not logged or stored. Check failures use controlled messages. Unexpected API failures log a generic message and return a generic server/configuration error.

The static response headers include a same-origin Content Security Policy, `nosniff`, a no-referrer policy and frame denial. The application has no external scripts, fonts or analytics.

Source control and Vercel upload ignore rules exclude populated environment files and local databases. Production credentials are Vercel Secrets, scoped to production. Never copy them into preview environments just to make a preview work.

## Boundaries

Nudge assumes its single administrator configures trusted portfolio applications. It does not sandbox arbitrary code because it does not execute user scripts. It is not a public monitoring service and has no plugin or workflow system.

There is no custom-header editor, arbitrary port support, general cross-origin login, browser automation, MFA, refresh-token persistence or automated password recovery. Add such capabilities only for a concrete need and review their effect on the current security boundary.

Owning modules: [auth](../../server/auth.ts), [crypto](../../server/crypto.ts), [HTTP transport](../../server/http.ts), [validation](../../server/validation.ts), [router](../../server/app.ts).
