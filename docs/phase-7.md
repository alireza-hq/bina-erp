# Phase 7 — production rollout and operations

## Scope and release decision

This phase hardens the existing application; no business workflow or schema was added. Production baseline is **one Node.js process / one application replica behind an HTTPS Nginx proxy**, using PostgreSQL and LDAPS. Horizontal scaling requires revisiting in-process throttles and export concurrency limits.

Next.js, @next/env and eslint-config-next were patched from 16.3.2 to **16.3.3**. Sharp is overridden to **0.35.4** within Next's supported range. These targeted changes address:

- [Windows-hosted Next.js RCE](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36)
- [Next.js image optimization RCE](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4)
- [Sharp/libheif vulnerabilities](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c)

Production dependency audit is now clear. No unrelated major upgrade or new runtime package was introduced. ESLint 9 and Drizzle Kit's esbuild-kit subdependencies emit deprecation notices; these remain development-tool debt. Recheck advisories for every release.

## Security review and changes

| Area                 | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LDAP                 | Existing 5-second connection, 8-second operation/search limits and verified LDAPS certificates retained. LDAP result must contain a directory identity and canonical account attribute. Invalid credentials return generic Persian 401; unavailable/DNS/network/timeout/malformed identity and DB provisioning failures return safe Persian 503. Client is unbound in finally. Passwords never enter local persistence or operational/audit logs.                                                                                   |
| Throttling           | Synchronous reservations prevent simultaneous requests from bypassing counters. Five failures/in-flight attempts per canonical account and source per 15 minutes; 300 total attempts/source and 1,000 total/process per window; at most 16 concurrent authentications. Success resets the account/source counter, not source/global abuse budgets. Directory/service failure refunds the account counter. Inactive local accounts count as failures. Expired counters are pruned and map size is bounded. 429 includes Retry-After. |
| Proxy identity       | X-Forwarded-For is never used as a limiter identity. Only a valid X-Real-IP is used when TRUST_PROXY=true; otherwise all requests use one shared source. Nginx must overwrite that header and direct access to Next must be blocked. Restart clears counters; no cross-replica coordination. Nginx also limits login traffic.                                                                                                                                                                                                       |
| Sessions             | Existing signed opaque cookie, SHA-256 database token hashes, seven-day expiry, login rotation, logout revocation and live user role/active checks retained. Oversized token strings are rejected. Expired-session cleanup added; no valid sessions are deleted.                                                                                                                                                                                                                                                                    |
| CSRF                 | Production accepts only APP_ORIGIN (fallback NEXT_PUBLIC_APP_URL), never a request/forwarded host-derived origin. Missing Origin and cross-site requests are rejected. Development keeps same-origin LAN support. All state-changing endpoint guards reviewed.                                                                                                                                                                                                                                                                      |
| Authorization / IDOR | Own report owner comes exclusively from session; foreign entry IDs and client employeeId rejected. EMPLOYEE denied company reporting, exports, locks and IT APIs. BUSINESS_ADMIN can read company reports/export/control periods, not IT master data or full audit. IT_ADMIN retains explicit admin access. Existing tests exercise direct endpoints, not only navigation.                                                                                                                                                          |
| Input                | Login and master-data JSON are streamed with a 16 KiB cap, content-type validation and existing Zod bounds. Work entries retain their 512 KiB cap, 50-row and date/decimal limits. Reporting/grouping/sorting/IDs remain allowlisted. Login now rejects unknown fields.                                                                                                                                                                                                                                                             |
| SQL / history        | Production queries are parameterized; no user-generated raw SQL. Grouping and sorting map to schema expressions. Work history FKs use RESTRICT; only user-to-session cleanup cascades. Audit append-only through app APIs. No new destructive migration.                                                                                                                                                                                                                                                                            |
| XLSX                 | Existing 20,000 source-entry cap, validated filters, safe filenames, numeric decimal cells, Persian text and formula-safe strings retained. At most two export requests generate workbooks simultaneously per process; excess requests receive 429 with Retry-After. Slots release on failures.                                                                                                                                                                                                                                     |
| Headers              | Existing DENY framing, nosniff, referrer policy, permissions policy and same-origin opener policy retained. X-Powered-By removed. HSTS belongs to the HTTPS proxy. A strict CSP is deliberately deferred pending nonce/Next streaming and browser validation; no untested policy breaks the app.                                                                                                                                                                                                                                    |

LDAP account/group membership does not grant local IT privileges. Production local account deactivation continues to override successful directory authentication. AD account state is verified at login, not continuously during the seven-day local session; urgent access removal must deactivate the local user.

## Runtime configuration

Use protected runtime environment files or a secret manager. Never put secrets in build args, Git, image layers, logs or shell command arguments.

| Variable                   | Production meaning                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DATABASE_URL               | Runtime PostgreSQL URL; use least-privilege runtime credentials and validated TLS for remote DB connections. Migration/backup credentials are separate. |
| LDAP_URL                   | LDAPS URL without embedded credentials. Existing bind-as-user flow; no service-account password.                                                        |
| LDAP_BASE_DN / LDAP_DOMAIN | Required directory search base and account domain.                                                                                                      |
| JWT_SECRET                 | Random secret at least 32 characters, not the example placeholder. Preserve across releases; rotation invalidates all cookies.                          |
| APP_ORIGIN                 | Exact external HTTPS origin, no credentials/path/query/fragment; runtime authoritative CSRF origin.                                                     |
| NEXT_PUBLIC_APP_URL        | Existing public metadata/build setting, fallback if APP_ORIGIN absent. Do not use it for secrets.                                                       |
| DB_POOL_MAX                | Integer 1–50; default 10. Budget across processes plus operators and backups.                                                                           |
| TRUST_PROXY                | Default false. Set true only behind the documented restricted proxy topology.                                                                           |
| ALLOW_INSECURE_HTTP        | Default false. Explicit test-only exception permits HTTP production-mode runs and disables Secure cookies. Never enable for normal HTTPS rollout.       |
| ALLOW_INSECURE_LDAP        | Default false. Explicit exception for a controlled legacy/test network; plain LDAP bind transmits credentials without TLS. Prefer LDAPS.                |
| NODE_EXTRA_CA_CERTS        | Optional mounted corporate CA PEM, configured before Node starts. Do not disable certificate verification.                                              |

Instrumentation validates required configuration before accepting requests, reporting variable names only. Database availability is checked via health rather than preventing recovery after a transient outage. Pool: 10 connections by default, 10s connect, 20s idle, 60s statement, 15s lock wait and 60s idle-in-transaction limits. Transactions release pooled connections. Nginx export timeout is 120s.

Development remains HTTP-capable with pnpm dev. Production cookies are Secure by default and will not work over ordinary LAN HTTP. Do not misdiagnose that as broken LDAP; terminate HTTPS or deliberately configure the documented test exception.

## Logging and health

GET /api/health returns only {"status":"ok"} / 200 or {"status":"unavailable"} / 503. It probes PostgreSQL with SELECT 1, shares in-flight probes, caches for five seconds and bounds response waiting to three seconds. It does not bind LDAP or expose schema/host information. It is reachability, not migration validation: run pnpm db:check separately. Restrict the proxy route to monitoring addresses.

Operational JSON logs contain timestamp, fixed event and allowlisted error code only. Authentication service failures, DB session lookup, work/admin/report/period/audit/export failures and framework request errors have separate event labels. No raw error messages, SQL text, cookies, request bodies or LDAP passwords are serialized by this logger. Expected validation/authorization failures are not noisy exceptions. Next.js also owns framework stderr; restrict log access, retention and collection accordingly. Business mutation history remains in audit_logs, independent of operational logs.

Send SIGTERM and allow at least 120 seconds to drain reports/exports before forced shutdown. Node is the container's foreground process. Monitor readiness/503s, request failures, login rejection rates, memory and DB connections. An unhealthy Docker health state alone does not automatically restart a live container; configure the host monitor/operator procedure.

## Database and maintenance

No Phase 7 migration/index is required. Existing indexes cover employee/date, date, project/date, project-file FK, session hash/user/expiry, unique week and audit ordering/filtering. EXPLAIN at representative scale used employee/date and date bitmap indexes and the audit-created backward index scan. Duplicate historical username indexes are harmless existing debt, not removed during rollout.

Run **pnpm sessions:cleanup** daily from one scheduler (cron/Task Scheduler) using the runtime database role. It deletes only expires_at <= database now(), in batches of 5,000 with SKIP LOCKED, maximum 20 batches per invocation. It is idempotent and reports a count; rerun if backlog exceeds 100,000. Failures exit nonzero. No queue or automatic audit deletion was introduced.

Audit grows indefinitely, including before/after work descriptions. At 100 employees × 3 activities × 250 working days, creates alone are roughly 75,000 events/year; edits and admin operations add more. Measure actual storage quarterly. HR/legal/IT must agree retention and archive/restore access before any deletion policy is implemented. Backups contain sensitive business data and audit descriptions.

Runtime role example (DB owner creates the role separately; do not run the app as owner/superuser):

```sql
GRANT CONNECT ON DATABASE employee_work_reporting TO work_runtime;
GRANT USAGE ON SCHEMA public TO work_runtime;
GRANT SELECT, INSERT, UPDATE ON users, departments, projects, project_files, reporting_periods TO work_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions, work_entries TO work_runtime;
GRANT SELECT, INSERT ON audit_logs TO work_runtime;
```

Keep schema DDL, archive access, audit update/delete and migration-journal management with a separate operator role. Account for existing grants/default privileges before applying this example; table owners cannot be restricted by GRANT alone.

Master administration lists remain simple in-memory filtered lists. This phase validates 100 users, 20 projects and 200 files; use about 500 users/projects and 200 files per project as an operator review threshold, not a claimed benchmark guarantee. Above that, measure UI payloads and plan server pagination/search. Company reports/audit are already paginated; export is capped; dashboard missing-person preview is bounded.

## Backup and restore drill

Before migrations, take a full custom-format PostgreSQL backup. These examples use PostgreSQL service definitions (pg_service.conf) and a protected PGPASSFILE rather than passwords in commands. work_reporting names the source; work_reporting_restore MUST name a separate disposable database. Keep backup files encrypted/access-controlled, checksummed and off-host. Use pg_dump/pg_restore compatible with the server version.

```sh
pg_dump --dbname="service=work_reporting" --format=custom --file=work-reporting-before-release.dump
pg_restore --list work-reporting-before-release.dump > work-reporting-before-release.contents
sha256sum work-reporting-before-release.dump > work-reporting-before-release.sha256
```

On Windows use Get-FileHash -Algorithm SHA256 instead of sha256sum. Do not mistake an archive listing/checksum for a successful restore.

Restore drill:

1. Record core counts during a maintenance window with writes/cleanup paused, so comparison to the backup snapshot is meaningful.
2. Create a new test database with an operator connection; configure the separate restore service. Never use the production service as the restore target.
3. Restore with errors fatal. Reapply test-role grants as needed; --no-owner/--no-privileges deliberately omit production ownership/grants.
4. Compare users, sessions, departments, projects, project_files, work_entries, reporting_periods and audit_logs counts, work-hour SUM, a known report week and retained legacy archive tables.
5. Point a separate test application/environment at the restored database; run db:check, health and report/XLSX checks. Disable real user access and use a test session secret so restored sessions cannot authenticate there.
6. Record date, archive checksum, server/tool versions, counts and tester outcome. Dispose of the isolated restore database only after explicit target verification.

```sh
createdb --maintenance-db="service=work_reporting_operator" work_reporting_restore
pg_restore --exit-on-error --no-owner --no-privileges --dbname="service=work_reporting_restore" work-reporting-before-release.dump
psql "service=work_reporting_restore" -v ON_ERROR_STOP=1 -c "SELECT count(*), coalesce(sum(man_hours),0) FROM public.work_entries;"
# In the separate restore app checkout, DATABASE_URL must point to the restore DB:
pnpm db:check
```

The full archive includes users/sessions/audit, the Drizzle migration journal and any legacy_letter_list schema. It is not safe to restore selected business tables independently while ignoring foreign keys. Role definitions and server configuration need separate infrastructure backups; pg_dump does not include cluster roles.

## Docker and Nginx

Dockerfile has dependencies/build, an explicit operations target, and a minimal non-root standalone runtime. .dockerignore excludes environment files, keys, backups, Git, node_modules and build output. The build uses a fake DB URL solely for module import; no production credentials/network are needed. Runtime secrets are supplied by --env-file. Public/static assets are copied into the standalone image. The operations image includes CLI tooling; it is never the web image.

```sh
docker build --target runner -t work-reporting:RELEASE .
docker build --target operations -t work-reporting-ops:RELEASE .
docker run --rm --env-file /etc/work-reporting/operator.env work-reporting-ops:RELEASE pnpm db:migrate
docker run --rm --env-file /etc/work-reporting/runtime.env work-reporting-ops:RELEASE pnpm db:check
docker run -d --name work-reporting --restart unless-stopped --stop-timeout 120 --env-file /etc/work-reporting/runtime.env -p 127.0.0.1:3000:3000 work-reporting:RELEASE
docker inspect --format='{{.State.Health.Status}}' work-reporting
```

Choose immutable release tags and retain the previous image. Pin base-image digests in your release pipeline after security scanning; the sample Node 22 bookworm tag receives patch updates, so rebuilds are not byte-for-byte image reproductions. Ensure container networking can reach PostgreSQL/LDAPS (localhost inside a container is not the host DB). Mount corporate CA files read-only if required.

Install deploy/nginx.conf.example inside the http context, replace hostname/certificate paths, configure the actual monitoring subnet and run nginx -t before reload. Bind Next only to loopback/private container networking. The proxy overwrites Host/X-Forwarded-Host/protocol/client IP, limits bodies to 512 KiB, bounds request-body time, rate-limits login and permits 120s exports. No websocket upgrade is needed for production Next; development HMR belongs to a separate dev setup. Unknown hostnames must be rejected by the host's default server configuration. Proxy access logs omit query strings/bodies.

Docker CLI is present in the implementation environment but the Linux daemon was unavailable; image build/run and nginx -t require deployment-host validation. Do not label these runtime checks as passed.

## Deployment and bootstrap

1. Select the reviewed release commit, retain prior image/configuration, and announce a maintenance window.
2. Back up and verify an archive; ensure a recent successful restore drill exists.
3. Configure HTTPS, LDAPS CA trust, APP_ORIGIN, random JWT_SECRET and least-privilege DB credentials; allow DB/directory network access only as required.
4. Build images from the lockfile, or install/build a clean Node 22 checkout with pnpm install --frozen-lockfile and pnpm build.
5. Review the migration chain and run **pnpm db:migrate** once with the operator role. Never run db:push in production. Historical migrations retain archived Letter List tables and preserve users/sessions; do not delete old migration files.
6. Run pnpm db:check with runtime credentials, then start the app and check health. No startup auto-migration.
7. On initial rollout, let the intended administrator authenticate through LDAP once. Run **pnpm admin:promote canonical.username** with operator credentials. It requires an existing active non-pending LDAP user and records a role-change audit. It does not create or reactivate accounts. Refresh the session view.
8. Check unclaimed historical pending: bootstrap accounts and explicitly deactivate any unused placeholder through IT administration; no named personal account receives privileges automatically.
9. Perform the live LDAP/persona smoke checklist below, open a real XLSX and verify lock/audit behavior.
10. Resume access, schedule daily expired-session cleanup, verify backup/monitoring schedules and record the release.
11. For HR weekly operations: review completed week → lock the full Saturday–Friday week → export. Unlock only for corrections, let the employee correct their own entries, review audited changes, then relock. Locks never snapshot current department/name attribution.

Rollback: first stop/restrict writes and diagnose. For an application-only failure without incompatible schema changes, deploy the previous **security-patched compatible** release/configuration; do not roll back to known-vulnerable Next.js 16.3.2. There is no automatic down-migration. If database recovery is required, obtain explicit authorization, preserve current evidence/data and restore the pre-release backup to a new database, validate it, then switch connections. Restoring loses writes made since that backup; reconcile them deliberately. Phase 7 itself has no schema changes.

## Automated evidence and performance

All database validation uses random isolated schemas/rolled-back transactions or the isolated HTTP fixture; it does not migrate application/production data. The full 0000–0007 chain is tested from empty, plus historical users/sessions/archive data injected before the domain-cleanup upgrade. The HTTP suite starts a real production server against a fresh migrated schema with test sessions, never company LDAP credentials.

Representative single-machine fixture: 100 employees, 20 departments, 20 projects, 200 files, 14,000 entries and 14,000 audit events across ten weeks:

- Employee dashboard: 13 ms; grouped week: 27 ms; business dashboard: 49 ms; audit page: 11 ms.
- Export SQL: 116 ms; 14,000-row workbook generation: 1,210 ms; XLSX: 496,459 bytes.
- Approximate process RSS increase including workbook parsing: 40 MiB.
- EXPLAIN execution: employee aggregate 0.064 ms, date aggregate 0.537 ms, audit page 0.239 ms.
  These are representative observations, not capacity guarantees or concurrent-load benchmarks. Recheck on deployment hardware.

Commands: frozen install; lint; typecheck; format:check; test; test:integration; db:check-migrations; drizzle-kit check; build; test:system; production package audit. Final results: frozen install, lint, typecheck, formatting, all 21 unit tests, all 34 PostgreSQL integration tests, fresh/upgrade migration validation, Drizzle metadata check, production build and standalone HTTP smoke passed. Production dependency audit reports no known vulnerabilities. The build also passed with a dummy DB URL and blank LDAP/session variables; actual runtime still requires validated configuration. The standalone HTTP check verifies the generated server launcher and static CSS assets.

## Human production smoke checklist — not replaced by test sessions

Live LDAP:

- Valid employee/password logs in and is provisioned as EMPLOYEE.
- Invalid password and unknown username return the same safe credential message.
- Directory DNS/network outage gives safe unavailable feedback and a sanitized operational event; restore networking and retry.
- Valid directory credentials plus inactive local account cannot access; no usable session created.
- Logout invalidates the database session; replay the old cookie only in the isolated test environment and verify rejection. Never paste cookies into logs/tickets/chat.
- First-login user can be explicitly promoted; local role/department survive subsequent LDAP sync. Verify HTTPS cookie HttpOnly, Secure and SameSite=Strict in browser tools.
- Confirm reverse-proxy origin/IP behavior and throttling from the real topology; do not brute-force real AD accounts into directory lockout.

Personas:

- EMPLOYEE: multiple rows, decimals, project/file dependency, edit/delete, dashboard totals, own-only access and locked-week read-only/rejection.
- BUSINESS_ADMIN: combined week/date/employee/department/project/file filters, one/two grouping levels, totals beyond current page, detailed/summary XLSX, lock/unlock; IT/audit forbidden.
- IT_ADMIN: user roles/departments/activation, master projects/files, deactivation confirmation, audit pagination/before-after; no audit edit/delete.
- All: Persian/RTL mixed codes, Jalali today/week, keyboard selectors/calendar, dirty-form warnings, 360/768/1440px widths, expired session and server-error feedback.
- Open exported files in Microsoft Excel: Persian text, numeric hours, totals, filter metadata and formula-safe strings.
- Confirm Docker health, Nginx config/TLS, graceful shutdown, DB outage recovery and a restore drill on deployment infrastructure.

Live company LDAP, connected-browser visual/keyboard QA, native Microsoft Excel, Docker daemon execution and host Nginx validation are pending unless separately recorded by a human tester.
