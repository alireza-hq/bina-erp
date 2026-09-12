# Phase 0 record

## Original architecture and classification

The starting Git working tree was clean. Next.js 16.3.2 App Router, React/React DOM 19.2.8, installed TypeScript 5.9.3, Tailwind 4, React Compiler, ESLint 9 and Prettier 3; pnpm 11.20.0 manages dependencies. PostgreSQL uses Drizzle ORM 0.45.2, Kit 0.31.10 and postgres.js 3.4.9. LDAP uses ldapts 9. Forms use React Hook Form and Zod; icons use Lucide.

| Classification          | Modules and handling                                                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reusable infrastructure | `src/db/index.ts`, Drizzle config/history, Next config/security headers, TypeScript/lint/format/package setup: preserved; CLI environment loading repaired                          |
| Authentication/LDAP     | `src/lib/auth.ts`, `ldap.ts`, auth handlers, login form/page, users/sessions: preserved; project helpers removed; disabled origin check repaired                                    |
| Generic shell/UI        | Root layout, Persian font/helpers, custom select, Jalali picker/helper, shared CSS and metadata: retained with neutral branding/dashboard and logout error handling                 |
| Letter List domain      | Project workspace, domain-heavy admin page/panel, project/sheet/letter/file/permission routes, upload utilities, domain validation and five domain tables: removed from active code |

`src/app` holds pages/handlers, `src/components` client UI, `src/lib` helpers, `src/db` schema/connection, `drizzle` SQL/snapshots and `public` assets. No tests, seeds, server actions, middleware, Docker, Compose, Nginx, deployment manifests or CI were found. Server pages and handlers authorized requests explicitly.

The database had users, sessions, projects, project_permissions, sheets, letters and files. Files stored bytea uploads. Permissions were read/write by project, with admin bypass and an owner-username-specific deletion rule. General roles were admin/user. Historical migrations record removal of super_admin and password_hash; neither is active authentication functionality.

## Changes

LDAP bind/search/unbind and the login form are unchanged. User sync, roles/active flags, signed cookies, expiry, single-session rotation, PostgreSQL pooling, logout and protected helpers remain. The generic admin user PATCH route remains guarded. No reporting schema, CRUD, metrics or workflows were added.

Removed project/sheet/letter CRUD, permission matrix/navigation, tables/search, upload/download functionality, domain components and CSS. Old branding/icons were replaced by a neutral SVG; UI/metadata/package naming changed. Cookie/global connection identifiers remain unchanged to avoid session/deployment disruption.

No runtime dependency was removed: surviving authentication and preserved generic controls use every existing package, including jalaali-js for the reusable date picker. Added `@next/env` directly at the existing Next.js version for CLI environment loading; no new package version was introduced.

Historical SQL is unchanged. The new migration archives five legacy tables/two enums while keeping public users/sessions. Snapshot tracks only the active auth schema. See README for migration deployment/rollback considerations.

## Validation (2026-09-12)

- Frozen-lockfile installation passed. Initial sandboxed pnpm execution could not prompt; the subsequent permitted install completed.
- ESLint, TypeScript/route type generation, auth tests, Prettier and production build were run. Initial build/typecheck found stale generated `.next/dev/types`; removing only those generated types resolved it.
- Live PostgreSQL connectivity and expected auth columns passed.
- Drizzle journal validation passed; generation against the new snapshot reported no changes.
- All four migrations replayed in isolated random schemas with synthetic rows in every legacy table plus an auth session. Archive row counts, auth join and cross-schema owner reference passed; the transaction rolled back.
- Production server started on port 3100. HTTP checks passed for login, protected dashboard/API, mutation origins and retired-route 404s.
- A temporary PostgreSQL user/session reached the shell. Logout removed the session/cookie; replay redirected to login. Fixture user was deleted afterward.
- Mocked LDAP tests cover bind identity, escaped search, mapping, verified LDAPS and unbind after failures. **No live successful LDAP login was performed because test credentials were not supplied.** Full acceptance still requires that deployment check; session fixtures do not prove a real LDAP bind.

## Remaining risks and debt

- Login throttling is in-process and keyed by forwarded IP/username. It resets between restarts/instances and expired map entries are not proactively purged. Review bounded/shared throttling and trusted proxy behavior before wider deployment.
- LDAP/database outages become generic login failures. This prevents disclosure but lacks operational diagnostics.
- Expired sessions are rejected but lack scheduled cleanup.
- `users_username_lower_idx` historically indexes raw username, despite its name. LDAP normalizes usernames; external database writes may not.
- Historical migration `0002` provisions a named admin and alters users. It was preserved, not replayed on real tables; review fresh-install policy.
- LDAP transport depends on environment. LDAPS verifies certificates; plain LDAP is unencrypted. Production browser cookies require HTTPS and correct proxy public origin.
- No browser automation or live LDAP credentials were supplied. Browser login/logout against the company directory remains a deployment acceptance check.
- Installation reports existing ESLint 9 and Drizzle transitive deprecations; upgrades are outside Phase 0.

Phase 1 starts at the shell, auth-only schema and validation boundaries listed in README, while keeping authentication regression coverage.
