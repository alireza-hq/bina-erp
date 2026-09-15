# Employee Work Reporting System

Persian/RTL work reporting with LDAP authentication, database-backed sessions, department/project management assignments, two-stage approvals, weekly employee read-only rules, company reporting and XLSX export.

The approved workflow revision supersedes Phase 1–7 domain behavior. Read [workflow, migration and rollout instructions](docs/workflow-revision.md) before upgrading. The [Phase 7 operational runbook](docs/phase-7.md) remains applicable to authentication, networking, backups and runtime operations except where the workflow revision explicitly supersedes it.

## Setup

Node.js 22, pnpm 11.20.0, Next.js 16.3.3, React 19.2.8, PostgreSQL and Drizzle ORM. Copy `.env.example` to `.env` for development, or `docker.env.example` to `docker.env` for Compose. Preserve the session secret when upgrading. Configure real LDAP/database settings; examples do not contain usable credentials.

```sh
pnpm install --frozen-lockfile
# Back up existing data and review migration 0008 first.
pnpm db:migrate
pnpm db:check
pnpm dev
```

## Identity and onboarding

LDAP authenticates the canonical username. The app owns Persian full name, department, application role and activation. Directory synchronization never overwrites the local name. Email and employee code are retired from the active schema/UI/exports.

Every new or migrated user must complete `/onboarding` before protected pages/APIs become accessible (API status 428). The name is trimmed and bounded to 2–160 characters; a selected active department must have an active manager. Admins can explicitly edit a user's local name/department. Role-only changes do not bypass onboarding.

For initial rollout, see the operator bootstrap sequence below; there is no hidden admin/onboarding bypass.

## Roles and managers

| Privilege                   | Source                       | Access                                                 |
| --------------------------- | ---------------------------- | ------------------------------------------------------ |
| Personal reporting          | Any completed active account | Own work only                                          |
| Business reporting/export   | BUSINESS_ADMIN or IT_ADMIN   | Company filters, totals, groups and exports            |
| System administration/audit | IT_ADMIN                     | Users, departments, projects, Reports and audit viewer |
| Department approval         | Department.managerUserId     | Pending department stage for that submitted department |
| Project approval            | Project.managerUserId        | Pending project stage for that project                 |

Managers retain their application role. Assignment can cover multiple departments/projects and combines with business/IT privileges. IT/HR roles alone never grant approval authority. Two explicit decisions are required even for the same manager or a manager's own submission. Pending responsibility follows current manager assignments; history records the actual actor and a snapshot of the acted-on work.

## Daily reporting

`/reports` shows personal Saturday–Friday weeks. `/reports/new` opens today in Tehran, and `/reports/[date]` provides the multi-row editor:

**Project → Report → Man-hours → optional Details / Remarks**

Reports are global admin-managed categories, independent of project; no uploads or Project File concept exists. New/resubmitted rows require active Report, active project with an active manager, and the employee's active department with an active manager. Ownership and department are resolved on the server.

The day action atomically submits new rows and resubmits rejected rows. Pending/approved rows are carried through unchanged; submitted rows cannot be deleted. Unsaved rows can be removed. Rejected records retain all earlier decision history. Limits remain 50 rows/day, 2,000 characters/remarks, exact 0.01–24 hours/row and 24 hours/day; totals above 12 hours warn. The API retains the day's optimistic version token.

Only the current Tehran week is editable, and future dates cannot be submitted. Previous weeks become read-only automatically without cron or manual locks. Managers can still act on historical pending requests.

## Approvals and reports

`/approvals` lists the current user's pending decisions; `?view=history` lists their own past decisions, with stage, reason, timestamp and original values. Both lists paginate at 50 rows.

`PENDING_DEPARTMENT_APPROVAL → PENDING_PROJECT_APPROVAL → APPROVED`; either stage can produce `REJECTED` with a required reason. An explicit current-week resubmission starts again at department approval.

`/admin/reports` defaults to **APPROVED** records for official totals. The URL `status` filter supports all four states and explicit `ALL`. Filtering/grouping by Report replaces Project File. Detailed rows, groups and exports share the same validated predicates and PostgreSQL exact totals. Report department attribution remains the employee's **current department**; workflow routing separately records the submission department.

XLSX preserves Persian text, RTL sheets, numeric hours, formula-injection protection, metadata and the 20,000-source-entry cap. No CSV/PDF or unrelated integrations are added.

## System administration

- `/system/users`: username, local Persian name, department, primary application role, active status.
- `/system/departments`: department and manager assignments; one manager per active usable department.
- `/system/projects`: project code/name and manager assignments.
- `/system/reports`: global Report master data with activation/deactivation.
- `/system/audit`: IT-only paginated operational business audit.

Existing managerless departments/projects survive migration but cannot accept onboarding/submissions until repaired. No master data is hard-deleted. The old project detail URL redirects to project administration; old Project File and manual lock APIs are removed.

## Initial administrator setup

1. Migrate, start the app, and let the selected administrator authenticate with LDAP once (they stop at onboarding).
2. From a trusted operator environment, run `pnpm admin:promote canonical.username`.
3. Run `pnpm seed:sample` if a suitable department does not exist. This idempotently creates **واحد نمونه** inactive with no manager, and prints its ID. It is never part of production migrations.
4. Run `pnpm profile:bootstrap canonical.username "نام فارسی مدیر" department-uuid`. This explicitly completes that existing IT user's profile, assigns them as department manager and activates the department. It refuses to replace a different assigned manager. Changes are transactional and audited; repeated identical calls are no-ops.
5. The administrator can now create/configure departments, project managers and active Reports. Other users complete onboarding normally.

Compose equivalents use `docker compose run --rm operations pnpm ...`. For an upgrade, use the same explicit bootstrap with the intended existing department when all administrators still require profile completion.

## Docker Compose

Compose runs PostgreSQL 17 and the production app together. PostgreSQL uses the persistent `postgres_data` named volume and is reachable as `db:5432` only inside the Compose network; no database port is published to the host. The app and operator commands wait for database readiness. It reads runtime configuration directly from `docker.env`; no `--env-file` flag is required. The app uses the Dockerfile health check and binds only to `127.0.0.1:3000` for the host Nginx proxy in `deploy/nginx.conf.example`.

```sh
cp docker.env.example docker.env
# Edit docker.env: matching POSTGRES_* / DATABASE_URL credentials, LDAP, session secret, HTTPS origin.
docker compose config --quiet
docker compose build app operations
# Back up the target database and review migrations before this explicit upgrade:
docker compose run --rm operations pnpm db:migrate
docker compose run --rm operations pnpm db:check
docker compose up -d app
docker compose ps
curl --fail http://127.0.0.1:3000/api/health
docker compose logs --tail=100 app
```

In PowerShell, use `Copy-Item docker.env.example docker.env` instead of `cp`. Fill in the placeholders before starting. `docker.env` is ignored by Git and excluded from image build contexts; restrict its filesystem permissions. Avoid printing `docker compose config` without `--quiet`, because resolved configuration contains secrets. Use `db` as the database hostname in `DATABASE_URL`. Keep its username/password/database consistent with `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB`. These initialization variables only affect an empty volume; changing them later does not rotate existing database credentials. The example uses the initial PostgreSQL administrator for setup; for production, provision a restricted app role and separate operator credentials following the Phase 7 runbook.

The `operations` service is profile-gated so normal `docker compose up -d` starts the database and app; explicit `run` commands can still invoke it. Migrations never run automatically at startup. Operator commands use the same database credentials from `docker.env`; use a protected operator environment with migration privileges if the application role is restricted, as described in the production runbook.

```sh
# After the selected administrator's first successful LDAP login:
docker compose run --rm operations pnpm admin:promote canonical.username
# Schedule daily through the host scheduler:
docker compose run --rm operations pnpm sessions:cleanup
# Recreate after changing docker.env:
docker compose up -d --force-recreate app
# Stop containers; the named PostgreSQL volume and its data are retained:
docker compose down
```

For local HTTP testing, follow the origin/security overrides in `docker.env.example`. Production keeps HTTPS cookies and LDAPS required. The Docker engine must be running in Linux-container mode. This configuration runs one app instance, matching the in-process throttle/export limits; it does not provision TLS certificates. `docker compose down` retains the database; do not add `--volumes` unless you intentionally want to delete its data. Existing external database data is not imported automatically; back up and restore it deliberately before switching the app.

### Container database backup

Create a PostgreSQL custom-format backup inside the container, then copy it to protected host storage (avoids binary shell-redirection issues on Windows):

```sh
docker compose exec db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/work-reporting.dump'
docker compose cp db:/tmp/work-reporting.dump ./work-reporting.dump
docker compose exec db rm /tmp/work-reporting.dump
```

Keep backups outside Git and the image build context. Follow the Phase 7 restore drill before relying on backups; changing the PostgreSQL major image version requires an explicit database upgrade/restore, not simply reusing the old data volume.

## Validation

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm format:check
pnpm test
pnpm test:integration
pnpm db:check-migrations
pnpm exec drizzle-kit check
pnpm build
pnpm test:system
```

Database tests use randomly named isolated schemas. Fresh migrations, committed legacy upgrades, transaction rollback, concurrent approvals, ownership, reporting math, XLSX parsing and session behavior are tested against PostgreSQL. HTTP smoke starts the standalone production server with synthetic sessions; it does not claim live company LDAP or visual browser/Excel validation.

Session cleanup remains `pnpm sessions:cleanup`. Health remains `/api/health`. Docker runtime, Nginx examples, origin checks, cookie flags, login throttling, sanitized logging and export limits are preserved. Production data is not migrated by tests.
