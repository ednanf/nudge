# Project Nudge — Development Specification

## 1. Overview

Build **Nudge**, a lightweight, self-hosted web application designed to prevent MongoDB Atlas free-tier clusters from being paused due to inactivity.

Nudge periodically authenticates with existing portfolio applications using disposable user accounts and performs a lightweight API operation that reaches their MongoDB databases.

The application must also provide a private dashboard where a single administrator can manage registered projects and inspect their execution history.

**Core philosophy:** Simplicity, minimal maintenance, minimal dependencies, and free-tier hosting. This is a small personal utility, not a commercial product or monitoring platform.

Avoid overengineering, unnecessary abstractions, and speculative functionality.

## 2. Technology Stack

Use the following technologies:

- **Frontend:** React, Vite, and TypeScript.
- **Backend:** Node.js, TypeScript, and Vercel Functions.
- **Persistent storage:** Turso (SQLite), or another equally lightweight, Vercel-compatible database if there is a compelling technical reason.
- **Authentication:** Argon2id for password hashing.
- **Encryption:** AES-256-GCM through Node.js's built-in `crypto` module.
- **Scheduling:** Vercel Cron Jobs.
- **Deployment:** Vercel Hobby plan.

Prefer native APIs and lightweight dependencies. Do not introduce a full authentication framework, ORM, state management library, or UI component framework unless clearly justified.

## 3. Authentication and Authorization

Nudge is a single-user application.

Implement the following:

- A private dashboard accessible only after authentication.
- A simple login page.
- Exactly one administrator account.
- No public registration functionality or registration API endpoints.
- No OAuth, social login, email verification, or password recovery.
- Secure administrator password storage using Argon2id.
- Secure session management using HttpOnly, Secure, SameSite cookies.
- Server-side authentication checks on every protected API endpoint.
- Basic login rate limiting to discourage brute-force attempts.
- Logout functionality that invalidates the active session.

The administrator account should be initialized through a documented setup procedure, using environment variables or a one-time setup script.

Do not expose administrator credentials to the frontend bundle.

Avoid implementing user management, roles, or permissions.

## 4. Project Management Dashboard

Create a clean, minimal, responsive dashboard.

The administrator must be able to:

1. Register a new project.
2. Edit an existing project.
3. Remove a project.
4. Enable or disable monitoring for individual projects.
5. Manually trigger a check for a project.
6. View the most recent check result.
7. View a basic execution history.
8. See the next scheduled execution.

Each project should support the following configuration:

- Project name.
- Base API URL.
- Authentication endpoint and HTTP method.
- Disposable account username or email.
- Disposable account password.
- Authentication request configuration.
- Authenticated keep-alive endpoint and HTTP method.
- Optional keep-alive request body.
- Enabled/disabled status.

Store any authentication credentials encrypted.

The dashboard must never display plaintext passwords after saving them. Editing a project should not require re-entering the password unless the administrator wants to change it.

Use a restrained visual design. Prioritize readability and functionality over visual effects.

## 5. API Authentication and Keep-Alive Operations

Portfolio projects may use different authentication mechanisms.

Implement a small, configurable HTTP execution system supporting:

### Authentication

- Configurable login endpoint.
- POST authentication requests by default.
- JSON request bodies.
- Configurable credential field names (e.g., `email`, `username`, `password`).
- Extraction of authentication tokens from JSON responses.
- Support for bearer tokens.
- Support for cookie-based authentication when practical.

### Keep-alive operation

After authenticating, Nudge should perform a configured HTTP request against the portfolio application's API.

Support:

- GET and POST methods.
- Optional JSON request bodies.
- Bearer token authorization.
- Cookie-based authorization.
- Configurable endpoint paths.
- Validation of HTTP response status.

The operation should reach the application's MongoDB database.

A successful HTTP response alone is not sufficient evidence that MongoDB was accessed. Document that the administrator must select an application endpoint that genuinely performs a database operation.

Avoid requiring modifications to existing portfolio projects whenever possible.

Do not implement arbitrary user-provided JavaScript execution, complex workflow builders, or general-purpose API automation.

### Execution safeguards

- Use reasonable HTTP request timeouts.
- Never log passwords, authentication tokens, session cookies, or decrypted secrets.
- Treat non-2xx responses as failures.
- Return useful, sanitized error descriptions.
- Prevent redirects to unexpected destinations from transmitting credentials.
- Do not allow arbitrary outgoing URLs that can reach Vercel's internal services, metadata endpoints, or private network resources. Apply appropriate SSRF protections.
- Limit execution concurrency.
- Prevent unnecessary overlapping checks.

## 6. Credential Encryption

Disposable portfolio accounts have deliberately limited permissions and contain no meaningful user data.

Nevertheless, store their passwords using reversible encryption rather than plaintext.

Implement:

- AES-256-GCM authenticated encryption.
- A securely generated encryption key provided through a Vercel environment variable.
- A unique random initialization vector for each encryption operation.
- Storage of ciphertext, IV, and authentication tag.
- Decryption exclusively in server-side functions.
- No exposure of encryption keys or plaintext passwords through frontend APIs.

Do not use Argon2 or bcrypt for disposable account credentials because Nudge must recover those passwords to authenticate automatically.

Use Argon2id only for the administrator password.

## 7. Persistent Storage

Use a minimal relational schema.

Suggested entities:

### Projects

Store:

- Unique identifier.
- Project name.
- API configuration.
- Encrypted credentials.
- Enabled status.
- Creation and modification timestamps.

### Execution history

Store:

- Unique execution identifier.
- Project identifier.
- Execution timestamp.
- Trigger source (scheduled or manual).
- Success/failure status.
- Sanitized error message.
- Execution duration.

### Sessions

If using database-backed sessions, implement a minimal sessions table with expiration and revocation support.

Use appropriate indexes and foreign keys.

Keep database migrations straightforward and documented.

Avoid storing excessive execution data. Implement basic log retention to prevent indefinite growth.

## 8. Scheduling

Use Vercel Cron Jobs.

The default schedule should be:

**Every Monday at 12:00 UTC (9:00 AM São Paulo time).**

This provides sufficient frequency to avoid MongoDB Atlas inactivity suspension while maintaining extremely low resource consumption.

Implement one scheduled endpoint that:

1. Validates the cron authorization secret.
2. Retrieves all enabled projects.
3. Executes their configured keep-alive operations.
4. Records individual execution results.
5. Continues processing other projects when one fails.
6. Returns a summarized execution result.

Use the `CRON_SECRET` environment variable to protect the scheduled endpoint.

Never rely on an authenticated browser session for scheduled execution.

Design the operation to tolerate duplicate cron invocations and occasional schedule delays.

Do not introduce background workers, message queues, or external scheduling infrastructure.

## 9. Dashboard Design

The interface should be practical and compact.

### Main dashboard

Show:

- Total registered projects.
- Enabled projects.
- Projects with successful last checks.
- Projects whose latest check failed.
- Last scheduled execution.
- Next expected execution.

### Project list

Display:

- Project name.
- API hostname.
- Enabled status.
- Last check timestamp.
- Last check result.
- Manual check action.
- Edit and delete actions.

### Project configuration

Use a simple form with clear labels and sensible defaults.

Provide a way to test the configured authentication and keep-alive operation before saving, when practical.

### Execution history

Display the most recent checks, including:

- Project.
- Timestamp.
- Trigger.
- Result.
- Duration.
- Sanitized error message when applicable.

Include basic loading, empty, and error states.

Use a responsive layout suitable for desktop and mobile.

A dark theme is welcome, but avoid spending significant effort on elaborate styling.

## 10. API Design

Use a small, conventional REST API.

Suggested routes:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `GET /api/projects`
- `POST /api/projects`
- `PATCH /api/projects/:id`
- `DELETE /api/projects/:id`
- `POST /api/projects/:id/check`
- `GET /api/checks`
- `GET /api/cron`

These are suggestions rather than mandatory route names.

All project management and execution-history endpoints must require administrator authentication.

The cron endpoint must use its own authorization mechanism.

Validate all incoming requests server-side.

Keep the architecture easy to understand and debug.

## 11. Environment Configuration

Use environment variables for deployment-specific secrets and configuration.

Expected variables include:

- `DATABASE_URL`
- `DATABASE_AUTH_TOKEN`, if required by the database provider.
- `ADMIN_PASSWORD_HASH` or equivalent initial administrator setup configuration.
- `ENCRYPTION_KEY`
- `SESSION_SECRET`, if required by the session implementation.
- `CRON_SECRET`

Provide an `.env.example` containing placeholders only.

Never commit secrets to Git.

Ensure server-only variables cannot be bundled into client-side code.

## 12. Reliability and Testing

Implement focused tests covering the important behavior:

- Admin authentication.
- Session validation and expiration.
- Protected API routes.
- Credential encryption/decryption.
- Project CRUD operations.
- Successful and failed API checks.
- Error sanitization.
- Cron authorization.
- Disabled-project handling.

Mock external HTTP requests.

Do not perform destructive operations against real portfolio projects during testing.

Keep testing infrastructure proportional to the application's size.

## 13. Deployment

The application should be deployable to Vercel using the Hobby plan.

Provide:

- Clear README documentation.
- Local development instructions.
- Database initialization and migration instructions.
- Administrator initialization instructions.
- Environment variable setup.
- Vercel deployment instructions.
- Cron configuration.
- Instructions for adding a portfolio project.
- Explanation of credential encryption and key backup.

Verify that the chosen architecture respects the current Vercel Hobby limits, including cron scheduling and function execution limits.

Avoid paid services wherever feasible.

## 14. Explicit Non-Goals

Do not implement:

- Multi-user authentication.
- Public registration.
- Team management.
- Subscription plans.
- Billing.
- OAuth providers.
- Email notifications.
- Webhooks.
- Complex monitoring or analytics.
- Distributed job queues.
- Browser automation.
- Full synthetic application testing.
- Arbitrary scripting.
- Plugin systems.
- Multiple configurable schedules per project.
- External cache services.
- Kubernetes, Docker orchestration, or dedicated servers.

If a feature does not directly support keeping portfolio databases active or managing their configuration, it probably does not belong in Nudge.

## 15. Development Instructions

Before implementation:

1. Inspect the existing repository, if present.
2. Verify the current constraints of the selected services.
3. Identify any architectural compatibility issues.
4. Propose a concise implementation plan.
5. Prefer the simplest viable solution when multiple alternatives exist.

During implementation:

- Use clear, idiomatic TypeScript.
- Keep modules small and cohesive.
- Prefer simple functions over unnecessary class hierarchies.
- Avoid premature abstractions.
- Use secure defaults without constructing an elaborate security infrastructure.
- Keep the user interface visually consistent.
- Provide meaningful validation and error messages.
- Avoid unnecessary external dependencies.

After implementation:

1. Run relevant tests.
2. Run type checking.
3. Verify the production build.
4. Document any configuration steps requiring manual intervention.
5. Identify limitations and remaining work.
6. Summarize the implemented architecture.

Do not deploy or provision external resources without explicit authorization.

## 16. Success Criteria

Nudge is complete when:

- I can deploy it to Vercel.
- I can log into a private dashboard using my single administrator account.
- Nobody can register additional accounts.
- I can register portfolio projects without modifying Nudge's source code.
- Disposable account credentials are encrypted at rest.
- I can manually trigger an authenticated API check.
- A scheduled job automatically checks all enabled projects weekly.
- Check results are persisted and visible in the dashboard.
- Failed checks are reported without interrupting unrelated projects.
- The entire system operates within free-tier allowances for a small number of projects.

**The primary objective is to deploy Nudge, register my portfolio applications once, and rarely need to interact with it again.**
