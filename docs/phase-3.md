# Phase 3: weekly business reporting

## Architecture and access

The existing Next.js server-page/route pattern, LDAP/session guards, role definitions, Drizzle connection, Persian select/date controls and date utilities are reused. No dependency is added. BUSINESS_ADMIN and IT_ADMIN can read company reports; EMPLOYEE cannot. Each page and API checks the existing server guard. Personal work-entry ownership rules and IT-only master-data permissions are unchanged. No write, export, approval, attendance, payroll, period-lock or analytics feature is added.

Files: `src/lib/business-report-query.ts` owns the strict shared Zod/URL model, `business-reports.ts` owns all SQL, and `business-report-api.ts` adapts authorization and safe HTTP responses. The service receives validated filters from trusted server callers; future export routes must apply the same reporting role guard before using it.

Routes: `/admin/reports`, GET `/api/admin/reports`, GET `/api/admin/reports/options`. Page layout, loading and error boundaries live under the reporting route. `BusinessReportFilters` reuses CustomSelect and JalaliDatePicker with bounded asynchronous search. The authenticated header adds company reports for the two authorized roles while retaining `/reports` for personal activity.

## Query and date semantics

One model covers inclusive `from`/`to`, employee/department/project/project-file UUIDs, primary/secondary grouping, allowlisted sorting and independent detail/group pagination. Both dates may be omitted to select the current Tehran-based Saturday–Friday week; otherwise both are required. Week links populate the same dates as custom ranges. A range spans at most 366 inclusive days in 2000–2099. Future review ranges are allowed. URLs and PostgreSQL use Gregorian dates; visible dates are Jalali. Duplicate/unknown query keys, malformed IDs, invalid dates, reverse/oversized ranges and duplicate grouping dimensions return validation errors.

All four optional ID filters combine using AND. A project/file mismatch matches no rows; options restrict files to the selected project. Without a project, cross-project files remain searchable and show parent context. Report options include active and inactive entities, return at most 50 values, retain an explicitly selected matching ID, and expose `more` to prompt narrower search. Employee labels include display name, username, optional code and current department without LDAP IDs/email/session details. Invalid or inconsistent bookmarked IDs produce no matches rather than being broadened to "all".

Department attribution is **current employee department**, not department at the work date. Moving an employee changes attribution of their earlier work. No snapshots were invented. Users without a department remain included through a LEFT JOIN and have an explicit unassigned group. Deactivated users, projects and project files remain reportable. Master labels are current names, consistent with Phase 2.

## Precision, grouping and pagination

The shared predicate and only many-to-one joins are reused by detail, summary and grouped queries. PostgreSQL computes SUM and COUNT; hours remain exact numeric strings, with trailing fractional zeroes removed for display. Group keys use UUIDs (date strings for date grouping), never names alone. Project-file labels include project name/code so repeated file codes remain distinct.

Primary and optional secondary dimensions are employee, department, project, projectFile and date. SQL GROUP BY creates primary/secondary pairs. Window SUM over grouped values supplies each primary group's full total/count before LIMIT/OFFSET. Group rows use stable label/key ordering and independent `groupPage`; primary totals may repeat across rows and are labelled accordingly. The overall sum is computed separately from every filtered work entry, so neither detail pagination nor group pagination changes it.

Details default to date descending, then display name and entry UUID. Every allowlisted sort includes stable tie-breakers. Both result lists use 25/50/100 rows per page (50 default), with positive page limits of 100000. Out-of-range pages return no rows but retain full counts/totals and offer a first-page link. Report reads use one read-only REPEATABLE READ transaction, so concurrent employee edits cannot give different snapshots to totals and rows within one response. Separate page requests intentionally read fresh snapshots; this is not a frozen export dataset.

## Migration and performance

Migration `0006_business_reporting_date_index.sql` creates a single B-tree index on work_date. Existing employee/date, project/date, file and users.department indexes already cover other common access paths. There are no core model changes, summary tables, materialized views or destructive statements. Full-chain isolated migration replay verifies compatibility with archived legacy data and preserved authentication records. Deployment uses `pnpm db:migrate` after target review; index creation uses the normal transactional migration and may briefly block writes on a large installation.

The integration fixture EXPLAIN ANALYZE for an inclusive date-range SUM completed in about 0.06 ms. This is a small-fixture correctness/planning observation, not a production load benchmark. PostgreSQL may correctly prefer sequential scans for tiny tables. Group count and window aggregation re-evaluate the grouped query; at this company scale the bounded date range and paged outputs are preferred over new analytics infrastructure. Large offsets and literal-substring option searches can become slower at much larger scale; keyset pagination/search indexes should be driven by measured need.

## Validation and limits

Deterministic PostgreSQL fixtures cover real signed-session roles; all individual and combined filters; inclusive endpoints; exact 10.5/7.5/3 and quarter-hour totals; inactive history; current-department reassignment; every grouping dimension; two-level reconciliation; duplicate employee names/project-file names; unassigned departments; stable multi-page detail/group results; totals independent of page size; bounded searchable options; index presence and EXPLAIN. Test schemas and fixture data are rolled back. Production HTTP tests additionally exercise anonymous/employee denial, business/IT access, server-rendered grouped pages, role-aware navigation, exact totals and unchanged IT restrictions.

Live company LDAP binding and interactive browser visual/keyboard QA are not demonstrated by fixture tests. Authentication code is unchanged. Remaining inherited debt includes in-process login throttling, expired-session cleanup and unpaginated IT master lists. Reporting itself is paginated. Reporting history has neither department/name snapshots nor an audit ledger, and pagination across separate requests can reflect intervening edits. No Phase 4 export is implemented.

Validation results: `pnpm test` passed 10 tests; `pnpm test:integration` passed 23 tests including parent suites; `pnpm db:check-migrations`, `pnpm exec drizzle-kit check`, `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm build` and `pnpm test:system` passed. Migration 0006 was applied only in isolated test schemas during this phase; the existing application database was not altered. Apply it with `pnpm db:migrate` during deployment. The reporting queries also work before the additive index is applied, with possible performance differences.
