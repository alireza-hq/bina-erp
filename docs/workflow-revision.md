# Approved two-stage workflow revision

This is the approved replacement for the earlier domain model, including its earlier exclusions of approval workflows. Authentication, primary roles, production hardening and the reporting/export architecture are retained. No unrelated product features were added.

## Data model and migration 0008

`0008_two_stage_approval.sql` is a reviewed Drizzle migration with a generated snapshot. Back up before applying it and deploy during a maintenance window: old and new app versions must not write concurrently across this schema change.

- Users retain IDs, LDAP identity, username, role, activation, timestamps and sessions. `display_name` is now the local Persian full name. `profile_completed_at` starts NULL for **every existing user**, requiring explicit completion. LDAP refresh only synchronizes identity/username.
- Nullable `manager_user_id` foreign keys (RESTRICT) are added to departments/projects. They are nullable for migration safety; new active records require an active manager through the administration service. Managerless migrated records remain visible to IT but are not submittable/selectable for onboarding.
- Global `report_types` stores Reports: name, optional description, active status and timestamps. Normalized names are unique, including inactive values.
- Work entries retain IDs, employee, date, project, description, numeric(5,2) man-hours and timestamps. Description remains the technical column name but becomes optional remarks (empty string allowed, at most 2,000 characters).
- New `report_id`, `department_id` and status fields support workflow. The department is captured from the user at submission/resubmission; it is not supplied by the browser. Report ID is NOT NULL after backfill.
- Every pre-revision work row receives the inactive **گزارش قدیمی** Report and status APPROVED. This is a documented grandfathering decision to preserve historical official totals, **not fabricated manager approval**. The legacy Report is created only if work rows exist. No `work_entry_approvals` are invented for legacy data. Submitted department is backfilled from the user's current department where available.
- `work_entry_approvals` contains stage, actor, decision, rejection reason, acted-at time, and a snapshot of the work and human-readable labels. Its work-entry/user foreign keys are RESTRICT. Rejected decisions require a non-null, nonempty reason. History survives resubmission and master-data edits.
- Indexes cover Report references, department/status and project/status queues, per-manager decision pagination and entry history. Existing employee/date, date and project/date indexes remain.

Retired data is archived **before removal from the active domain**:

| Archived object                             | Contents                                   |
| ------------------------------------------- | ------------------------------------------ |
| `workflow_archive.user_retired_fields`      | Existing user ID, email and employee code  |
| `workflow_archive.work_entry_project_files` | Work-entry ID and former Project File ID   |
| `workflow_archive.project_files`            | Original Project File table, moved intact  |
| `workflow_archive.reporting_periods`        | Original manual-period state, moved intact |
| `workflow_archive.reporting_period_status`  | Enum required by the archived period table |

The old composite work-entry/Project File FK and active column are removed only after the mapping is copied. Users lose active email/employee-code columns only after copying. No work-entry, session or generic audit row is deleted or rewritten. Historical audit enum values remain legal for old rows, but no old lock/File mutation routes remain. The archive is outside the active Drizzle schema and has no application routes; do not grant the runtime role archive access. No automatic archive deletion/retention policy is introduced.

The committed-database upgrade integration fixture verifies original IDs, hours, details and timestamps, session hashes, original audit JSON, archived associations/fields and inactive legacy Report mapping. Fresh migration tests run the entire 0000–0008 chain.

## Onboarding and bootstrap

All protected page helpers redirect incomplete profiles to `/onboarding`; the corresponding API guard returns 428. Login/logout and onboarding itself remain reachable. A valid signed session alone does not bypass completion. Inactive local accounts remain denied even after LDAP succeeds.

The form accepts only trimmed full name (2–160 Unicode characters) and department ID. It supports Persian naturally without enforcing a brittle alphabet-only rule. Department options are searchable and require active departments and active assigned managers. The transaction rechecks both. Profile fields cannot be modified by adding them to work-entry payloads.

Existing users must confirm their local name instead of silently accepting LDAP display names. IT may explicitly supply the name and department through administration; a role-only change does not mark onboarding complete. If a department is deliberately cleared, onboarding is required again.

Mandatory onboarding would otherwise block initial administration. Operator procedure:

```sh
# Selected person first logs in through LDAP; do not create a local/password identity.
pnpm admin:promote canonical.username
# Optional development/demo department, inactive by default; prints ID.
pnpm seed:sample
# Explicitly assigns the initial IT user as manager, activates the chosen department,
# and completes that user's name/department. Refuses another assigned manager.
pnpm profile:bootstrap canonical.username "نام و نام خانوادگی فارسی" department-uuid
```

These commands require trusted database-operator access. They do not embed a personal account. The sample seed is opt-in and idempotent; profile bootstrap only accepts an existing active LDAP-provisioned IT_ADMIN. Profile bootstrap and assignment changes are audited transactionally with null actor and an explicit operator-command source. Do not run it with arbitrary end-user input.

## Approval and editing rules

The application role remains EMPLOYEE, BUSINESS_ADMIN or IT_ADMIN. Management is composed independently through department/project relationships. The same user may manage multiple entities and combine those assignments with any application role.

1. A day save submits all new rows and explicitly resubmits its rejected rows in one transaction. Pending/approved rows must be present and unchanged. Unsaved rows can be removed; **submitted rows cannot be deleted**, preserving decision history.
2. The authenticated employee supplies neither employee, department nor manager IDs. The server captures their current department and checks active department/project managers and an active Report.
3. Each new/resubmitted row becomes PENDING_DEPARTMENT_APPROVAL.
4. The current manager of the captured department may approve/reject that stage. Approval rechecks that the project has an active manager and advances to PENDING_PROJECT_APPROVAL.
5. Only the current manager of the project may decide the project stage. Approve becomes APPROVED; either stage may become REJECTED with a required trimmed 1–1,000-character reason.
6. Two explicit actions are required even if the managers are the same person, or the employee is their own manager. No self-approval bypass and no IT/HR role override exists.
7. Rejected current-week entries may be corrected and resubmitted. Their earlier decisions and original snapshots remain. Pending/approved entries cannot be edited. Previous-week rejected entries also remain read-only; this revision adds no correction override.

**Reassignment model:** current manager relationships own pending stages at action time. Changing the manager transfers the pending queue to the replacement, and the old manager can no longer act. Decisions already made retain their actor, stage and snapshot; the former manager still has access to their own decision history. This is a deliberate choice instead of approver snapshots/reassignment tooling. Deactivated managers cannot act; IT must assign an active replacement. Inactive master data does not hide historical pending requests.

Work-entry transactions lock the employee and affected work rows, compare the existing day version, then validate/mutate/audit atomically. Approval transactions lock the work entry, validate the active actor and relationship under row locks, and conditionally transition the expected state. Concurrent repeated decisions produce one transition/history record; stale attempts return 409. Any audit/history insert failure rolls back the business change. Deadlocks/timeouts fail safely and can be retried; no partial write is accepted.

## Automatic week rule

Saturday–Friday remains the only week definition. `todayInTehran()` determines the business day; editable dates must belong to its current week and cannot be in the future. The mutation service checks the derived week before writing and again before returning the transaction. There is no period row to materialize, no cron requirement and no manual unlock API/UI. Client read-only indicators are informative; server rules remain authoritative.

Managers may approve/reject historical pending entries regardless of the week. Such a decision can change approved-only HR totals for a historical week even though employees cannot edit its work values. This is the intended replacement for the old manual freeze model.

## Reporting, exports and dashboard semantics

The shared validated URL model adds `reportId` and `status`, replacing Project File everywhere. `status` defaults to APPROVED; the four states and explicit ALL are available in the reporting controls. Official business/dashboard totals use approved rows only; employee day/week totals show their own submitted hours across states with separate status counts. Missing-approved-reporters means active EMPLOYEE accounts with completed profiles and no approved record in that week, **not absence or attendance**.

Grouping dimensions: employee, current department, project, Report and date; two distinct levels remain supported. Source joins remain many-to-one. Report master data is global and independent of selected project. Inactive historical values remain filterable/displayable.

Department attribution in HR reports/exports remains the **current user department**. The new work-entry department snapshot is used for approval routing only. Reassigning a user may therefore change historical department aggregates; approval history snapshots retain the acted-on department/name/values.

XLSX details include Jalali date, Persian employee name, username, current department, project code/name, Report, remarks, numeric hours and status. Metadata includes active status/filter semantics and source totals. One/two-level summaries reuse the same SQL groups. Export ignores UI pagination, keeps the 20,000-source-entry cap and two-generation concurrency cap, preserves formula-safe string cells and exact server totals. No export results are stored.

## Routes and UI

- `/onboarding`, `POST /api/onboarding`: mandatory profile completion.
- `/reports`, `/reports/new`, `/reports/[date]`: existing personal workflow with searchable independent Project/Report selectors, decimal hours, optional remarks, status/rejection display and multi-row submit/resubmit.
- `/approvals`: current manager's pending stages; `?view=history` shows only their own decisions. Both paginate at 50. Confirmation is required for decisions; rejection requires a reason. History displays snapshots rather than changed resubmitted values.
- `POST /api/approvals/[id]`: strict `{stage, decision, rejectionReason?}`. IDs/manager ownership/status are checked server-side; no generic update-status API exists.
- `/system/reports`, `GET/POST /api/admin/reports-master`, `PATCH /api/admin/reports-master/[id]`: IT-only global master data, distinct from company reporting routes.
- Users/departments/projects administration reuses existing controls, with searchable manager selectors and visible manager assignment. `/system/projects/[id]` redirects to the project list.
- Removed: `/api/admin/projects/[id]/files/*`, `/api/admin/reporting-periods/*` and manual period-control buttons.
- Navigation is the union of application role and management relationships. Former managers retain their history link without gaining current approval authority.

UI remains Persian/RTL, with bidi isolation for mixed project codes, existing loading/error boundaries, keyboard-accessible searchable selects, and disabled pending/approved rows. Onboarding includes logout when no eligible department is available.

## Audit

New events: WORK_ENTRY_SUBMITTED, WORK_ENTRY_RESUBMITTED, DEPARTMENT_APPROVED/REJECTED, PROJECT_APPROVED/REJECTED, DEPARTMENT_MANAGER_CHANGED, PROJECT_MANAGER_CHANGED, REPORT_CREATED/UPDATED/ACTIVATED/DEACTIVATED, PROFILE_COMPLETED. Existing user/master mutation events continue. New events contain only whitelisted business state; no password, LDAP DN, cookie or session token is recorded. Generic audit and decision history have no update/delete application endpoints.

## Deployment after pull

1. Announce a maintenance window. Back up using the Phase 7 procedure and verify a restore copy. Review the archive/backfill rules above; preserve the existing JWT secret and LDAP configuration.
2. Build both app and operations targets from the same release. Stop the old app before migration; leave PostgreSQL running.
3. Apply the migration once, explicitly, using a database role allowed to create the archive schema and alter/move the legacy objects.
4. Validate the schema. If the runtime DB role is restricted, grant it the new table/type permissions, then start the new app.
5. Bootstrap the initial IT profile if necessary, assign/repair all active managers, create real active Reports, and let employees complete onboarding. The legacy Report is intentionally unavailable for new records.
6. Verify live LDAP, onboarding, employee submission, both manager stages, reporting and Excel download on the deployment host.

```sh
docker compose build app operations
docker compose stop app
# Backup before this command; it upgrades the configured database.
docker compose run --rm operations pnpm db:migrate
docker compose run --rm operations pnpm db:check
docker compose up -d app
# If needed, operator commands as described above:
docker compose run --rm operations pnpm admin:promote canonical.username
docker compose run --rm operations pnpm seed:sample
docker compose run --rm operations pnpm profile:bootstrap canonical.username "نام فارسی مدیر" department-uuid
```

For a separate restricted runtime role, adapt the existing role names (do not blindly grant privileges to a public/default role):

```sql
GRANT SELECT, INSERT, UPDATE ON public.report_types TO app_runtime;
GRANT SELECT, INSERT ON public.work_entry_approvals TO app_runtime;
GRANT USAGE ON TYPE public.work_status, public.approval_stage, public.approval_decision TO app_runtime;
```

Retain existing permissions for users/departments/projects/work_entries/sessions and append-only audit inserts. Do not grant archive access to the runtime role. Separate operations credentials may be required. Docker configuration, Nginx, trusted origins, HTTP/TLS settings, LDAP CA trust, health, login throttling, session cleanup and operational logging were not relaxed by this revision. The earlier deployment login-service error remains a separate environment issue requiring the deployment host's logs.

Rollback is a paired application/database recovery. The old binary expects removed active columns/tables; do not restart it against the upgraded schema. Restore a verified pre-migration backup into a separate database and switch both app/database deliberately, accounting for any new writes. No destructive automatic down migration is supplied.

## Validation and remaining limits

Automated checks cover fresh migration, a committed legacy upgrade, profile gates, local-name preservation, independent privileges, both approvals/rejections, resubmission history, own-record isolation, concurrent duplicate decisions, audit-failure rollback, Tehran Friday/Saturday boundaries, historical pending approvals, exact reporting/status/export parity, inactive references, and initial bootstrap idempotency. Existing authentication/throttling/origin/XLSX safety tests remain active.

Representative PostgreSQL fixtures retain 100 employees, 20 departments/projects, 200 Reports and 14,000 work/audit rows. The final concurrent local test run measured 63ms employee dashboard, 80ms grouped report, 146ms business dashboard, 48ms audit page, 269ms export query and 2.7s generation for a 14,000-row workbook (about 56MiB RSS increase). These are local observations, not production guarantees.

Remaining operational decisions: current-assignment routing and explicit self-approval are intentional; no old-week employee correction override exists; history/archive retention is not automated; manager/master dropdowns load current company-scale options; LDAP/browser/real Excel validation and Docker/Nginx execution require the deployment environment. No production database migration or live LDAP bind was performed during implementation.

Final automated validation:

- Frozen-lockfile dependency installation passed; no dependency changes.
- 22 unit tests and 35 PostgreSQL integration tests passed. The additional same-manager two-action assertion also passed in a targeted rerun.
- Fresh migration-chain validation and committed legacy-data upgrade passed; Drizzle schema snapshot has no drift.
- Lint, typecheck, formatting and production build passed.
- Production standalone HTTP smoke passed against an isolated PostgreSQL schema, including onboarding, both approvals, reporting/export, authorization, immutable submissions and logout.
- No production migration, actual company LDAP bind, browser visual QA, real Microsoft Excel or Docker/Nginx execution is claimed.

Manual rollout checklist:

- Existing/new LDAP user reaches onboarding; direct page/API access is blocked until completion; logout works from onboarding.
- Initial IT bootstrap, manager assignment, active Report setup, and inactive/no-manager errors are understandable.
- Employee creates several rows, sees statuses, cannot change pending/approved rows, and corrects/resubmits a rejected current-week row.
- Department then project manager decide explicitly; same-person/self approval still takes two actions; rejection reason appears; history survives corrections.
- Manager reassignment transfers pending responsibility; the previous actor's history remains.
- Historical employee pages are read-only while managers can decide pending records.
- Official totals default to approved, ALL/pending/rejected filters are labelled, and downloaded XLSX opens in Microsoft Excel with matching numeric totals.
- Persian/RTL desktop/tablet layout, searchable-select keyboard behavior, focus, long remarks and mixed project codes are usable.
