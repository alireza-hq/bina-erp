# Employee Work Reporting System

Phase 1 provides LDAP-backed identity, application roles, departments, projects and predefined project-file values. Employee work entries, HR reporting and analytics are not implemented.

## Setup and migration

Use Node.js 22 and pnpm 11.20.0. Copy `.env.example` to `.env` and configure the directory and PostgreSQL connection. Preserve the existing database identity, session cookie name and secret when upgrading.

```sh
pnpm install --frozen-lockfile
# Back up and review migrations before upgrading an existing installation.
pnpm db:migrate
pnpm db:check
pnpm dev
```

Production: `pnpm build`, then `pnpm start`. Production browser sessions require HTTPS. No Docker, Compose, Nginx or CI configuration is present in this repository.

| Variable              | Purpose                                                                               |
| --------------------- | ------------------------------------------------------------------------------------- |
| `DATABASE_URL`        | PostgreSQL connection for application and CLI                                         |
| `LDAP_URL`            | Directory endpoint; LDAPS validates server certificates                               |
| `LDAP_BASE_DN`        | Directory search base                                                                 |
| `LDAP_DOMAIN`         | Domain for binding bare usernames                                                     |
| `JWT_SECRET`          | Random secret of at least 32 characters; signs opaque session tokens                  |
| `NEXT_PUBLIC_APP_URL` | Exact public origin including scheme/port; configure behind HTTPS-terminating proxies |

Never log, store or commit LDAP passwords. CLI scripts use Next.js environment loading. Changing the session secret invalidates existing cookies.

## Identity, roles and authorization

LDAP authenticates and supplies username, display name, directory identity and email. LDAP sync only updates those directory fields; it never overwrites local role, department, employee code or active state. New users are `EMPLOYEE`. Employee codes are optional local data, not fabricated LDAP attributes. Last successful login is recorded when a session is created.

| Role             | Phase 1 access                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| `EMPLOYEE`       | Authenticated dashboard                                                                              |
| `BUSINESS_ADMIN` | Authenticated dashboard, recognized as business administrator; no IT permissions or reporting screen |
| `IT_ADMIN`       | Dashboard; manage users, roles, departments, projects and project-file values                        |

`src/lib/roles.ts` is the canonical role definition used by PostgreSQL/Drizzle, Zod and UI. `requireUser()` protects authenticated pages; `requireRole(...roles)` protects role-specific pages; `requireApiRole(request, ...roles)` protects APIs. Anonymous APIs return 401; disallowed roles return 403. Every IT handler checks authorization, independent of navigation/layout visibility.

Sessions remain seven-day signed, HttpOnly, SameSite=Strict cookies backed by hashed PostgreSQL tokens. Login rotates sessions. Every request checks current database role and active state. User deactivation revokes sessions; reactivation does not revive them. Session creation locks the user row and rechecks activation to serialize against deactivation. IT admins cannot demote or deactivate themselves. User mutations serialize with an advisory transaction lock and recheck the actor, preventing two administrators from simultaneously removing each other's access.

Mutation origins must match the request URL or configured public URL. Forwarded host headers are not blindly trusted. LDAP credentials alone never grant IT access.

## Bootstrap IT administrator

On an existing installation, genuine LDAP-provisioned `admin` users become `IT_ADMIN`; existing `user` users become `EMPLOYEE`. Active/inactive state and identity IDs are preserved. Unclaimed historical identities whose `ldap_id` starts with `pending:` become `EMPLOYEE`, including the old personal-account bootstrap. Historical SQL is retained for migration compatibility, but no personal username receives implicit privilege in the final schema or login code.

For a fresh installation, or controlled promotion of another administrator:

1. Apply migrations and let the selected person log in once with LDAP (as an employee).
2. From a trusted operator shell with the correct `DATABASE_URL`, run `pnpm admin:promote canonical.username`.
3. The existing active user becomes `IT_ADMIN`. Refresh the app; a new login is not required because roles are read from PostgreSQL.

The command does not create users, reactivate accounts, or promote pending bootstrap placeholders. It takes an explicit canonical username and requires database write access. Do not put LDAP passwords in the command. There is no automatic first-login promotion or hidden environment-based privilege assignment.

## Administration

Persian/RTL IT screens:

- `/system/users`: search by username, display name or employee code; filter by role/status; edit role, department, employee code and activation. Directory-controlled names/email are read-only.
- `/system/departments`: list/search, create, edit, activate/deactivate units.
- `/system/projects`: list/search, create, edit, activate/deactivate projects.
- `/system/projects/[id]`: project metadata and predefined project-file options. Each option has a code, display name and optional description. Examples include PID-001, MTO-004 and Vendor Doc 77. No uploads are implemented.

Employees/business admins see dashboard navigation only. IT admins also see users, departments and projects. Dashboard shows identity, role, assigned department and neutral placeholder text; it has no fake statistics.

Department names are unique among active departments after trimming/case normalization. Project codes are unique across active/inactive projects. Project-file codes are unique within a project, including inactive values. IDs and all mutation bodies are validated with strict Zod schemas. Duplicate values return a clear 409 instead of a database exception.

Inactive departments cannot be newly assigned, but existing assignments can remain or be cleared. All values remain visible to IT. Inactive projects retain their files; creating or reactivating a file requires an active parent. Editing existing descriptions or deactivating values remains possible. Future work-entry selectors must filter both project and file activation. No hard-delete endpoints exist; relevant foreign keys use RESTRICT.

## API routes

All routes below require `IT_ADMIN`:

| Route                                     | Methods   |
| ----------------------------------------- | --------- |
| `/api/admin/users`                        | GET       |
| `/api/admin/users/[id]`                   | PATCH     |
| `/api/admin/departments`                  | GET, POST |
| `/api/admin/departments/[id]`             | PATCH     |
| `/api/admin/projects`                     | GET, POST |
| `/api/admin/projects/[id]`                | PATCH     |
| `/api/admin/projects/[id]/files`          | GET, POST |
| `/api/admin/projects/[id]/files/[fileId]` | PATCH     |

The project ID is taken from the route; a file cannot be moved or updated through another project's URL. Login/logout remain `POST /api/auth/login` and `POST /api/auth/logout`. Old letter/sheet/upload/permission routes remain removed.

## Database safety

Active tables: `users`, `sessions`, `departments`, `projects`, `project_files`. Application `users.isActive` maps to the existing SQL column `active`; it was not renamed. New nullable user fields are `department_id`, `employee_code` and `last_login_at`.

Migration `0003` archives the old domain in `legacy_letter_list` without dropping data. It must precede `0004`, which creates a new, unrelated `public.projects` table. The archive remains outside the active Drizzle domain. Migration `0004_identity_and_master_data.sql` backfills roles as documented above, replaces the enum, adds user metadata and creates the three master-data tables and indexes. Users and sessions are not deleted.

These migrations were tested in isolated schemas and **were not applied to the configured application database during Phase 1**. Run `pnpm db:migrate` before using the new authenticated screens. `db:check` intentionally requires the Phase 1 columns and roles. Back up first, deploy code/schema together in a maintenance window, and account for migration table locks. Do not run old code against the new role enum. Rollback requires a reviewed reverse migration/backup strategy, including how BUSINESS_ADMIN maps back; no destructive down migration is supplied.

Historical migrations `0000`–`0002` remain unchanged. They include the former named bootstrap and role changes. Fresh installs replay them, then `0004` removes pending-account privilege. Existing real administrators retain access. Archive deletion is a separate destructive operation; never use schema push to discard it.

## Validation

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm db:check-migrations
pnpm exec drizzle-kit check
pnpm format:check
pnpm build
pnpm test:system
```

- Unit/auth tests execute actual TypeScript modules with external boundaries mocked.
- Integration tests execute actual authorization/auth/admin functions against PostgreSQL in isolated randomly named schemas; the whole transaction is rolled back.
- Migration checks replay all migrations with legacy fixture rows and verify archive data, role backfills and session preservation, then roll back.
- `test:system` needs a production build and free port 3101. It creates isolated schemas, starts the production server with that search path and fixture sessions, tests HTTP pages/APIs and removes only those schemas afterward. It never migrates real application tables. If forcibly terminated, inspect the `phase1_http_<uuid>`/matching archive schemas and remove only the abandoned test fixtures.
- `test:smoke` targets an already running server on port 3100 (`SMOKE_BASE_URL` overrides). Optional `--authenticated` inserts/removes a temporary user/session in the configured application database; use only after migrating it.

The database test role needs schema creation privileges. Passwords are never needed for fixture sessions. These tests verify session/authorization behavior, not a successful real LDAP bind. Live company LDAP login/logout and visual browser QA remain deployment checks; no connected browser or LDAP test credentials were available in this session.

See [Phase 1 record](docs/phase-1.md) and the historical [Phase 0 record](docs/phase-0.md).
