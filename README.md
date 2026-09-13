# Employee Work Reporting System

Phase 3 adds weekly company reporting for business and IT administrators: combined filters, paginated details, exact totals and one/two-level grouping. Personal multi-row reporting, LDAP-backed identity and IT master data remain available. Exports, approvals, period locking, payroll and analytics dashboards are not implemented.

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

| Role             | Current access                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| `EMPLOYEE`       | Dashboard and own work reports                                                                     |
| `BUSINESS_ADMIN` | Dashboard, own work reports and company reporting; no IT master-data permissions                   |
| `IT_ADMIN`       | Dashboard, own/company reports; manage users, roles, departments, projects and project-file values |

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

## Employee work reporting

All three roles can manage their own entries. Personal APIs have no privileged cross-employee view or ownership override; company reporting uses separate read-only routes.

- `/reports`: personal Saturday–Friday week, daily/weekly totals and entry counts; previous/current/next available week navigation.
- `/reports/new`: opens today's editor (today is determined in Asia/Tehran).
- `/reports/[date]`: Jalali date picker and multi-row project/file/description/hours editor. Route dates are Gregorian YYYY-MM-DD. Changing dates loads that date's own records, with a warning before abandoning edits.

Project changes clear incompatible file selections. File choices load active values only from the selected project. Original inactive references remain labelled and selectable for that existing row; description/hours can be corrected without changing them. New or changed references must be active. All saves are server-validated.

| API                                        | Behavior                                                             |
| ------------------------------------------ | -------------------------------------------------------------------- |
| GET /api/work-entries?week=YYYY-MM-DD      | Current user's seven-day summary; defaults to the current week       |
| GET /api/work-entries/[date]               | Current user's rows, exact total and optimistic version token        |
| PUT /api/work-entries/[date]               | Atomic replacement of that user's date set with { version, entries } |
| GET /api/work-entry-options                | Active projects                                                      |
| GET /api/work-entry-options?projectId=UUID | Active files of the active project                                   |

A row accepts optional existing `id`, `projectId`, `projectFileId`, `description`, and `manHours` as a decimal **string**, e.g. `"1.50"`. Neither employeeId nor workDate is accepted in the body; date is in the URL and ownership comes from the session. Unknown query/body properties are rejected. Use PUT for both first save and edits; there is no separate bulk-delete endpoint. An empty entries array deletes only the caller's rows for that date after the version check.

The service locks the employee row, rechecks activation, checks the loaded day's state hash, validates every row and relationship, then updates surviving IDs, removes omitted owned IDs and inserts new rows in one transaction. Stale/duplicate inserts return 409 rather than overwriting later changes. The hash is a concurrency token, not an authorization token. The editor keeps unsaved rows on errors and offers explicit reload on conflicts.

Limits live in `src/lib/work-reporting.ts`: at most 50 rows/day, 2,000 description characters/row, 512 KiB request body, 0.01–24 hours/row, maximum 24 hours/day. Totals over 12 hours warn without blocking unless the 24-hour sanity bound is exceeded. Hours support two decimal places, Persian/Arabic digits and the Persian decimal separator. All arithmetic uses integer hundredths; storage is PostgreSQL numeric(5,2).

Dates must be real Gregorian dates from 2000-01-01 through 2099-12-31; writes cannot be after today in Tehran. There is no historical edit-period locking. Readable weeks include all seven days; future days are not offered for entry.

## Company reporting

`/admin/reports` is available only to BUSINESS_ADMIN and IT_ADMIN. EMPLOYEE is redirected to the dashboard; report APIs return 403 (401 for anonymous requests). Business admins still cannot access IT master-data APIs. Navigation keeps personal reports separate from company reports.

The current Saturday–Friday week opens by default. Previous/current/next week links populate the same inclusive `from`/`to` dates used by custom ranges. Dates use Gregorian storage/URLs and Jalali presentation; ranges are limited to 366 days within 2000–2099. Future ranges are permitted for review, usually returning no results.

GET `/api/admin/reports` and the page share a strict reusable query model in `src/lib/business-report-query.ts`:

- `from`, `to`: both supplied or both omitted for the current week.
- `employeeId`, `departmentId`, `projectId`, `projectFileId`: optional UUIDs, combined using AND.
- `groupBy`, `groupBySecondary`: employee, department, project, projectFile or date; the second requires a different primary dimension.
- `sort`: date (default), employee, department, project, projectFile or manHours; `direction`: desc (default) or asc.
- `page`, `groupPage`: independent positive page numbers (maximum 100000); `pageSize`: 25, 50 (default) or 100.

Unknown/repeated query parameters are rejected. Applied filters, grouping, sorting and pagination are bookmarkable URL state. Totals and counts represent every matching row, not the current page. Grouped pairs have separate pagination; each row includes its complete primary-group total, even when subgroups span pages. Do not sum the repeated primary-total column.

`src/lib/business-reports.ts` is the reusable query layer for later export. Parameterized SQL uses allowlisted columns, many-to-one joins, PostgreSQL SUM/COUNT/GROUP BY and window totals in one read-only repeatable-read transaction. Numeric sums remain strings through display; no JavaScript fractional summation is used. IDs distinguish equal employee names and equal project-file codes; file labels include project context.

**Department attribution means the employee's current department**, including for old entries. No department snapshot is stored. Unassigned users form a distinct "بدون واحد" group. Inactive employees/projects/files remain reportable and filterable; reporting does not impose active-only predicates.

GET `/api/admin/reports/options?kind=employee|department|project|projectFile` provides up to 50 searchable options with a `more` flag. Optional `search`, `selected`, `projectId` and `departmentId` support dependent choices and current selection retention. Search is limited to 100 characters. Selecting a project narrows file options; without it, files across projects are searchable with contextual labels. Inactive options are labelled. These endpoints do not expose LDAP IDs, credentials or session metadata.

Migration `0006_business_reporting_date_index.sql` adds only `work_entries_date_idx` for company-wide date ranges. Existing employee/date, project/date and file indexes are retained; no summary tables or snapshots were introduced. Review and apply with `pnpm db:migrate`. See [Phase 3 record](docs/phase-3.md) for validation and limitations.

## Administration

Persian/RTL IT screens:

- `/system/users`: search by username, display name or employee code; filter by role/status; edit role, department, employee code and activation. Directory-controlled names/email are read-only.
- `/system/departments`: list/search, create, edit, activate/deactivate units.
- `/system/projects`: list/search, create, edit, activate/deactivate projects.
- `/system/projects/[id]`: project metadata and predefined project-file options. Each option has a code, display name and optional description. Examples include PID-001, MTO-004 and Vendor Doc 77. No uploads are implemented.

All roles see dashboard and personal work-report navigation. IT admins also see users, departments and projects. Dashboard shows identity, role, assigned department and links to personal reports; it has no fake statistics.

Department names are unique among active departments after trimming/case normalization. Project codes are unique across active/inactive projects. Project-file codes are unique within a project, including inactive values. IDs and all mutation bodies are validated with strict Zod schemas. Duplicate values return a clear 409 instead of a database exception.

Inactive departments cannot be newly assigned, but existing assignments can remain or be cleared. All values remain visible to IT. Inactive projects retain their files; creating or reactivating a file requires an active parent. Editing existing descriptions or deactivating values remains possible. New work-entry selections filter both project and file activation. No master-data hard-delete endpoints exist; relevant foreign keys use RESTRICT.

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

Active tables: `users`, `sessions`, `departments`, `projects`, `project_files`, `work_entries`. Application `users.isActive` maps to the existing SQL column `active`; it was not renamed. New nullable user fields are `department_id`, `employee_code` and `last_login_at`.

Migration `0003` archives the old domain in `legacy_letter_list` without dropping data. It must precede `0004`, which creates a new, unrelated `public.projects` table. The archive remains outside the active Drizzle domain. Migration `0004_identity_and_master_data.sql` backfills roles as documented above, replaces the enum, adds user metadata and creates the three master-data tables and indexes. Users and sessions are not deleted.

These migrations were tested in isolated schemas and **were not applied to the configured application database during Phase 1**. Run `pnpm db:migrate` before using the new authenticated screens. `db:check` intentionally requires the current columns, including work_entries, and roles. Back up first, deploy code/schema together in a maintenance window, and account for migration table locks. Do not run old code against the new role enum. Rollback requires a reviewed reverse migration/backup strategy, including how BUSINESS_ADMIN maps back; no destructive down migration is supplied.

Historical migrations `0000`–`0002` remain unchanged. They include the former named bootstrap and role changes. Fresh installs replay them, then `0004` removes pending-account privilege. Existing real administrators retain access. Archive deletion is a separate destructive operation; never use schema push to discard it.

Migration `0005_employee_work_entries.sql` adds the transactional table, an exact decimal/date schema, checks and indexes. A composite foreign key to project_files(id, project_id) enforces the project-file relationship in PostgreSQL as well as the service. User/project/file references use RESTRICT; master-data deactivation never removes history. There is no daily parent table or uniqueness constraint on employee/date. The generated migration was reordered to create the referenced unique index before its foreign key. Apply reviewed migrations with `pnpm db:migrate` after a backup; no unknown environment is migrated by tests.

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
- Integration tests execute actual authorization/auth/admin/work-entry functions against PostgreSQL in isolated randomly named schemas; the whole transaction is rolled back.
- Migration checks replay all migrations with legacy fixture rows and verify archive data, role backfills and session preservation, then roll back.
- `test:system` needs a production build and free port 3101. It creates isolated schemas, starts the production server with that search path and fixture sessions, tests HTTP pages/APIs and removes only those schemas afterward. It never migrates real application tables. If forcibly terminated, inspect the `phase1_http_<uuid>`/matching archive schemas and remove only the abandoned test fixtures.
- `test:smoke` targets an already running server on port 3100 (`SMOKE_BASE_URL` overrides). Optional `--authenticated` inserts/removes a temporary user/session in the configured application database; use only after migrating it.

The database test role needs schema creation privileges. Passwords are never needed for fixture sessions. These tests verify session/authorization behavior, not a successful real LDAP bind. Live company LDAP login/logout and visual browser QA remain deployment checks; no connected browser or LDAP test credentials were available in this session.

See [Phase 3 record](docs/phase-3.md), [Phase 2 record](docs/phase-2.md), [Phase 1 record](docs/phase-1.md) and the historical [Phase 0 record](docs/phase-0.md).
