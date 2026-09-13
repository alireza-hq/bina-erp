# Phase 2: employee work reporting

## Scope and architecture

The existing Next.js/React, LDAP/session, role authorization, Drizzle, validation and Persian controls were retained. No runtime dependency was added. Every authenticated role can submit its own reports; BUSINESS_ADMIN and IT_ADMIN have no ability to view or modify another employee's work entries. No HR/company-wide reporting, exports, approvals, analytics or period locking were added.

`src/lib/work-reporting.ts` holds shared date/decimal limits and integer arithmetic. `work-validation.ts` defines strict Zod payloads. `work-entries.ts` owns database reads and atomic daily reconciliation. `work-api.ts` adapts the existing role guard and safe JSON error pattern, including a streaming request-size cap. Pages use the same services with the server-verified user's ID. No employeeId is accepted from requests.

## Schema and migration

`0005_employee_work_entries.sql` adds work_entries with id, employee_id, work_date (date), project_id, project_file_id, description, man_hours (numeric(5,2)), created_at and updated_at. Employee ownership makes redundant createdBy/updatedBy unnecessary in this phase. There is no parent-day table, and many rows may share an employee/date.

The employee/date, project/date and project-file indexes support ownership-scoped history and references. Foreign keys use RESTRICT. A composite project-file FK and the new unique index on project_files(id, project_id) prevent mismatched project/file pairs even outside the API. Database checks bound description length, per-entry hours and the date domain. The daily total and current-date rules are transactional service checks.

The initial generated SQL placed the composite FK before its required unique index. Isolated PostgreSQL replay caught this; the migration was reordered and the full chain subsequently passed. Existing auth/master data and the archived old domain are not dropped by this migration. Deployment command: `pnpm db:migrate`, after reviewing the target and taking a backup. Do not run schema push as a substitute for migration history.

## Atomic writes, ownership and concurrency

GET of a date returns that employee's rows, related names/activation state, exact total and a SHA-256 version of the owned rows' IDs, values and update timestamps. PUT accepts that version and the complete intended row set. It validates the date, bounded JSON body and strict row schema, then:

1. Locks/rechecks the active employee row, serializing saves with concurrent saves and account deactivation.
2. Reads only that employee/date and compares the version. Stale snapshots return 409.
3. Rejects duplicate/malformed IDs and any ID outside the owned date.
4. Locks selected master references against concurrent deactivation and verifies every project-file relationship. Only unchanged existing references may be inactive.
5. Updates changed surviving rows without recreating their IDs, deletes omitted owned rows, inserts new rows and returns the new snapshot, all in one transaction.

An empty set clears the caller's date only. No independent delete endpoint accepts a victim ID. A repeated successful insert with its old version is stale; identical no-op updates are harmless. Production HTTP tests race two submissions from the same snapshot and confirm one success, one 409, and no duplicate rows.

The state hash is intentionally not a security credential or permanent revision ledger. It detects changed snapshots, not an ABA sequence that returns to the exact same state. Future audit/history or locking can be added at the service boundary. Raw out-of-band database writes can bypass daily-total/active-state policy; database access must remain controlled.

## Historical and date/decimal behavior

Deactivating master values preserves readable historical names and links. An existing row may retain its original inactive pair while changing hours/description. The editor labels that original option, permits reverting to it before saving, and never defaults a historical row to another project/file. New or changed pairs require both an active project and active file.

Storage and routes use Gregorian dates; UI dates use the existing Jalali picker/formatter. Today is based on Asia/Tehran. Weeks start Saturday and include Friday. Dates must be valid, within 2000–2099, and not future-dated for writes. No old-period lock is imposed.

Hours travel as decimal strings with at most two places. Persian/Arabic digits and the Persian decimal separator are normalized. UI/service totals sum integer hundredths and format only at the boundary; no binary fractional-hour sums are used. For example 2 + 1.5 + 3 returns 6.50 and displays 6.5.

Limits: 50 rows/day, 2,000 description characters, 512 KiB request body, 0.01–24 hours/row, 24 hours/day. More than 12 hours raises a nonblocking warning. These constants are documented in README; database checks intentionally mirror fixed per-row constraints.

## Pages and APIs

- `/reports`: current user's weekly table and totals, empty state and week navigation.
- `/reports/new`: authenticated redirect to today's editor.
- `/reports/[date]`: multi-row editor with Jalali date selection, add/remove/save and totals.
- GET `/api/work-entries?week=...`: own weekly summary.
- GET/PUT `/api/work-entries/[date]`: own snapshot and atomic save.
- GET `/api/work-entry-options[?projectId=...]`: active project or dependent file choices.

The editor reuses CustomSelect/JalaliDatePicker, clears the file when a project actually changes, ignores obsolete option responses, shows loading/empty/error states, disables duplicate submission and warns before abandoning edits through its date/back controls. Session expiry preserves draft rows and offers login in a new window. A successful save updates the client IDs/version; conflict reload is explicit. On narrow screens the entry table scrolls horizontally to keep controls usable.

## Validation

Automated validation covers existing LDAP/session/IT behavior plus decimal/date/payload unit tests; isolated PostgreSQL ownership, numeric precision, foreign keys, indexes, activation, rollback, multi-row add/update/remove and historical-reference scenarios; full migration replay; and production HTTP page/API checks including genuinely simultaneous submissions. Lint, typecheck, formatting and production build are included in the handoff checks.

Completed checks: `pnpm test` (9 passed), `pnpm test:integration` (15 passed, including parent suites), `pnpm db:check-migrations`, `pnpm exec drizzle-kit check`, `pnpm db:generate --name verify_phase2` (no schema changes), `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm build` and `pnpm test:system` all passed.

The previously requested local setup was completed on 2026-09-13 after verifying DATABASE_URL targets localhost. A fresh custom-format PostgreSQL backup was saved under ignored `data/backups/`, reviewed migrations were applied with `pnpm db:migrate`, and `pnpm db:check` passed. Identity/session fingerprints confirmed all 5 existing users and 3 sessions were preserved; one active IT administrator remains. No remote environment was migrated. The development server was started on port 3000. Use `http://localhost:3000`: the local smoke test passed with this origin, while the 127.0.0.1 alias was rejected by existing origin validation. Authenticated smoke checks verified the shell and logout/replay rejection using a temporary fixture that was removed afterward.

No browser connection was available for interactive/visual QA, and no real LDAP test credentials were supplied. Production HTTP tests use fixture sessions; they are not evidence of a real company LDAP bind. LDAP code is unchanged. Manual deployment checks should cover login, keyboard/date/dropdown interaction, session expiry and responsive layout.

Remaining inherited debt includes in-process login throttling, expired-session cleanup, unpaginated IT lists and limited operational diagnostics. Unsaved drafts are not persisted across browser restarts. No audit ledger or historical period locking exists yet. Names are joined from current master data rather than snapshotted; renaming a master value updates its display in historical reports.
