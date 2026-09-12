# Employee Work Reporting System

Phase 0 foundation only. No work-reporting business features or schema have been implemented.

## Setup

Use Node.js 22 and pnpm 11.20.0. Copy `.env.example` to `.env` and configure PostgreSQL and your company directory. Keep the existing database name, cookie name and secret when upgrading.

```sh
pnpm install --frozen-lockfile
pnpm db:check
# Review migration notes below before migrating an existing database.
pnpm db:migrate
pnpm dev
```

Production: `pnpm build`, then `pnpm start`. HTTPS is required for browser sessions because the production cookie is Secure. No Docker, Compose, Nginx or CI configuration exists in this repository.

| Variable              | Purpose                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`        | PostgreSQL URL; required by application and Drizzle CLI                                                |
| `LDAP_URL`            | Directory endpoint; LDAPS verifies server certificates                                                 |
| `LDAP_BASE_DN`        | Directory search base                                                                                  |
| `LDAP_DOMAIN`         | Domain appended to bare usernames                                                                      |
| `JWT_SECRET`          | At least 32 random characters; signs opaque tokens despite the historical name                         |
| `NEXT_PUBLIC_APP_URL` | Exact public origin, including scheme/port; configure for reverse-proxy HTTPS termination and metadata |

The CLI and diagnostic scripts load `.env` with Next.js environment loading. Never commit credentials. Changing `JWT_SECRET` invalidates existing cookies.

## Authentication and routes

LDAP binds with supplied credentials, searches the escaped account name, and always unbinds. Directory identity is synchronized into `users`. No LDAP password is logged or persisted. New users receive the `user` role; existing roles and active flags are preserved.

Sessions last seven days. Only a SHA-256 token hash is stored in PostgreSQL. The cookie is HMAC-signed, HttpOnly, SameSite=Strict, and Secure in production. Login replaces previous sessions; logout deletes the session and cookie. Inactive users and expired sessions are rejected.

- `/` redirects according to the session.
- `/login` retains the LDAP form and redirects authenticated users to `/dashboard`.
- `/dashboard` calls `requireUser()` on the server and shows identity, placeholder text and logout.
- `POST /api/auth/login` validates input and authenticates through LDAP.
- `POST /api/auth/logout` revokes the current session; the UI reports failures and allows retry.
- `PATCH /api/admin/users/[id]` retains the existing admin-only role/active management API. There is no admin page in Phase 0.

There is no middleware/proxy auth layer. Server pages and handlers enforce authorization. Every Phase 1 API must authorize access explicitly; a layout alone does not protect APIs. Mutation requests require an Origin matching the request URL or configured public URL. LAN origins work without disabling this check. Forwarded host headers are not blindly trusted.

## Database migration safety

The active Drizzle schema contains only `users`, `sessions` and `user_role`. Historical migrations `0000`–`0002` remain unchanged for compatibility.

`0003_retire_legacy_domain.sql` **does not drop data**. It moves `files`, `letters`, `project_permissions`, `sheets`, `projects`, `file_kind` and `project_permission` from `public` to `legacy_letter_list`. Data, uploaded bytes, indexes, constraints and foreign keys remain. `public.users` and `public.sessions` are untouched. The archive is outside the active application schema and is not a reporting schema.

Back up before applying; retire external consumers of old public table names and schedule for brief table locks. The database role needs schema creation and object ownership privileges. An existing archive schema causes failure rather than silently merging data. Existing privileges remain; archived letter references can prevent deletion of referenced users. Physically removing the archive is a separate destructive operation requiring explicit review.

The migration was prepared and validated but **not applied to the configured database**. The application works with either pre-archive or post-archive tables. A fresh database replays history before archiving. Historical migration `0002` provisions `a.haghighi` as admin and alters legacy roles; review this inherited policy before a fresh deployment. The previous README incorrectly claimed the first login became administrator.

Rollback planning: move the five tables and two enums back to `public`, provided there are no name collisions. Coordinate app rollback and Drizzle journal state with the database operator; do not casually edit an applied journal. Do not use `drizzle-kit push` to delete the archive.

## Validation

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm build
pnpm db:check
pnpm exec drizzle-kit check
pnpm db:check-migrations
```

`db:check` is read-only. `db:check-migrations` creates randomly named isolated schemas inside a transaction, replays migrations with fixture data, checks archive/auth preservation, then rolls back everything. It requires schema creation privileges and never migrates real application tables.

Start `pnpm start --port 3100`, then run `pnpm test:smoke`. Optional `pnpm test:smoke --authenticated` inserts a unique temporary user/session, checks shell/logout/replay rejection and removes the fixture in `finally`. No existing user is modified. If forcibly terminated, remove only the identified `phase0-test:<uuid>` user. `SMOKE_BASE_URL` selects another local server. Manually supplied cookies test server behavior; browser Secure-cookie behavior still requires HTTPS.

`pnpm test` executes actual TypeScript modules with mocked LDAP/database/Next.js boundaries. A live successful LDAP login still requires a company account: log in, check identity, log out and verify `/dashboard` redirects to `/login`. Do not put passwords in command history or test fixtures.

If an old dev build leaves stale types for deleted routes, stop that dev server, remove generated `.next/dev/types`, then rerun typecheck/build.

## Phase 1 starting points

- `src/app/dashboard/page.tsx`: minimal protected shell.
- `src/components/app-header.tsx`, `src/app/layout.tsx`, `src/app/globals.css`: navigation, metadata, RTL styling and local font.
- `src/lib/auth.ts`, `src/lib/ldap.ts`: preserve authentication/session boundaries.
- `src/db/schema.ts`, `src/db/index.ts`, `drizzle.config.ts`: active schema and database tooling.
- `src/lib/api.ts`, `src/lib/validation.ts`: errors and validation.
- `src/components/custom-select.tsx`, `src/components/jalali-date-picker.tsx`, `src/lib/jalali.ts`, `src/lib/persian.ts`: reusable controls/localization.
- `tests/auth.test.cjs`, `scripts/smoke.mjs`: regression checks.

See [Phase 0 record](docs/phase-0.md) for inventory, changes, validation and remaining risks.
