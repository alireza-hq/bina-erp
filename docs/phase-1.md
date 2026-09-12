# Phase 1 implementation record

## Architecture

Retained Next.js 16.3.2 App Router, React 19.2.8, pnpm, Drizzle/postgres.js, LDAP, signed database sessions, Persian local font and reusable controls. No dependencies or major framework were added. `src/lib/roles.ts` holds canonical roles. `src/lib/auth.ts` owns page/API authorization. `src/lib/admin-api.ts` shares validation, database operations and safe error mapping behind thin route handlers. Existing `CustomSelect` and styling are reused by two compact client administration components.

## Schema and migration

`0004_identity_and_master_data.sql` creates departments, new project master data and project_files. User identity/session columns survive. `isActive` maps to the historical users.active column; nullable departmentId, employeeCode and lastLoginAt are added. Foreign keys retain history with RESTRICT, and normalized unique indexes cover active department names, project codes and project-local file codes.

Existing LDAP-backed admin accounts map to IT_ADMIN even if currently inactive (activation is not changed). Other users map to EMPLOYEE. Unclaimed pending identities lose historical automatic admin privilege. Sessions retain IDs, hashes and expiry. New LDAP users default to EMPLOYEE; synchronization does not alter application metadata. No work-entry or reporting tables were created.

The historical archive migration must run before the new projects table can be created. Neither pending migration was applied to the configured database. Both were exercised on isolated PostgreSQL schemas. README documents coordinated deployment and backup requirements.

## Authorization and activation

EMPLOYEE and BUSINESS_ADMIN only access the authenticated shell. IT_ADMIN accesses users, departments, projects and project-file options. APIs return 401/403 and never rely on UI visibility. Pages protect their own data reads as well as the shared system layout. Roles are fetched from the database per request, so permission changes affect existing sessions.

User deactivation revokes sessions. Reactivation cannot revive revoked cookies. Self-demotion/deactivation is rejected. User administration serializes and rechecks actor rights to prevent concurrent administrator lockout. Session creation locks/checks the user and records lastLoginAt. Inactive departments cannot receive new assignments; existing references remain valid. Inactive projects block new/reactivated file values; history remains editable and visible. There are no DELETE endpoints or uploads.

## Bootstrap

`pnpm admin:promote <canonical-username>` explicitly promotes an existing active LDAP-provisioned account after its first login. No personal username appears in active bootstrap/auth code. No LDAP role/group inference, automatic first-login promotion or password storage is introduced. Historical migration text remains for compatibility.

## UI and routes

Persian/RTL pages: `/system/users`, `/system/departments`, `/system/projects`, `/system/projects/[id]`. Shared header shows IT links only for IT_ADMIN. Dashboard displays role and department without statistics.

APIs: GET users; PATCH user; GET/POST departments and projects; PATCH department/project; GET/POST a project's files; PATCH a project file. All reside under `/api/admin`. The user API retains its Phase 0 path. Reused project path names expose entirely new master data, not archived Letter List functionality.

Users can be searched and filtered; directory fields are read-only, local role/unit/code/activation editable. Master-data lists support search/status filtering and create/edit forms. Project details show metadata and predefined file values.

## Validation and limits

Validation included six unit/auth tests, PostgreSQL integration subtests for every admin boundary, user changes, departments, projects, files and provisioning, all-migration replay/data-preservation checks, schema snapshot consistency, ESLint, typecheck, formatting, production build, and production HTTP tests against isolated fixtures.

HTTP tests exercise anonymous/employee/business-admin rejection, IT page rendering and API access, master-data creation, department/role assignment, project-file deactivation, user deactivation and logout. Real LDAP bind success was not tested because no credentials were supplied. No browser was connected, so interactive/visual QA remains unverified. LDAP bind/search/unbind code is unchanged.

Remaining debt:

- In-process login throttling is not shared between instances and expired counters are not proactively purged.
- Expired sessions lack scheduled cleanup; LDAP/database login failures lack distinct operational diagnostics.
- Administration lists currently load all rows and filter client-side; add server pagination when real scale warrants it.
- Updates have last-writer-wins semantics; audit history and optimistic concurrency are future requirements, not Phase 1 features.
- User-role transitions are serialized, but arbitrary out-of-band SQL operators can bypass application guards. Restrict database credentials appropriately.
- Historical raw-username index naming, dependency deprecations and bootstrap migration history remain documented Phase 0 debt.
- Production browser sessions require HTTPS and correct public-origin configuration. Plain LDAP transport remains an environment decision; LDAPS verifies certificates.

Phase 2 work entries and HR reporting were not started. Their eventual selection APIs must enforce active project/file rules on the server and define access deliberately rather than reuse IT-only endpoints for employees.
