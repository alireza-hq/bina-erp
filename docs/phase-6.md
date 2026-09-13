# Phase 6 — dashboards and daily usability

## Delivered

- Employee `/dashboard`: current Saturday–Friday range, weekly and today hours, days with entries, OPEN/LOCKED indicator, seven-day overview, and a today action labelled create/edit/view according to existing data and locks.
- Business/IT dashboard: exact current-week hours and entry count; distinct people reporting (all roles, including inactive historical users); active projects represented; missing-report count; bounded project/department summaries and links to the full paginated reports; existing XLSX actions.
- Missing reporters means **active users whose primary role is EMPLOYEE with zero entries in the current week**, regardless of department assignment. Admin roles are excluded from this expected-reporter population. This is not attendance, absence, or a submission deadline. Display is capped at 20 names, with the full count shown. A historical active `pending:` bootstrap account also counts until an operator deactivates it; Phase 6 does not silently change user state.
- Work editor: searchable project and project-file dropdowns; keyboard arrow/Home/End navigation, Escape and focus restoration; new-row focus; row copy without original IDs; sticky daily total/save controls; explicit dirty/saving feedback; locked state; predictable removal focus. Copied inactive historical references are cleared so the copy requires active choices; original rows remain untouched.
- Unsaved edits: value-based dirty tracking (reverting edits clears it), refresh/close warning, date-change confirmation, and confirmation for ordinary link navigation. Successful save resets the baseline. Browser back/forward and programmatic navigation/logout are not fully intercepted; no fragile history monkey-patching was added.
- Reporting: explicit apply-filter guidance, applied filter chips with removal links, clear reset-to-current-week action, existing previous/current/next navigation, and unchanged export/period controls. Removing a chip removes only that filter; other filters remain active.
- Identity: display name, role and department in the account header; clearer dashboard/personal-report labels. Personal reporting remains available to every role, preserving existing permissions. IT links remain IT-only.
- Common UI: visible focus rings, bidi isolation for mixed project values, tabular numeric values, distinct period banners, responsive dashboard cards, deliberate horizontal scrolling for wide entry/report tables, desktop table hover highlighting, loading/error boundaries for dashboard and system pages. Existing audit filters, pagination and before/after expansion are retained.
- Deactivation confirmation for master records and users, explaining historical retention/session revocation. No new domain concepts.
- Jalali picker uses the same Tehran today utility as reporting (previously browser-local today); initial day focus, descriptive day labels, Escape/focus restoration and tab containment while open.

## Query and data architecture

`src/lib/dashboards.ts` contains server queries and explicit existing auth guards. Employee ownership comes from `requireUser()`, not request data. `getOwnWorkWeek()` now aggregates daily hours/counts in PostgreSQL, returning at most seven rows; exact integer hundredths remain the presentation arithmetic.

Business dashboard calls the existing reporting engine for project and department groups, with an optional transaction connection so all cards/breakdowns/counts share a read-only repeatable-read snapshot. No client aggregation of company rows and no second reporting filter engine. SQL EXISTS computes missing reporters; distinct SQL counts compute reporting people and active represented projects. Breakdowns show up to 50 groups by name, explicitly labelled when truncated, and link to full paginated grouping. The engine also reads a bounded detail page; eliminating those unused detail queries is a possible future optimization, not a correctness issue.

Report filter display labels are resolved inside the existing reporting snapshot when filters are present; SQL predicates, grouping keys, sorting, pagination and export behavior are unchanged.

No migration, table, dependency or environment variable was added. Existing migrations through `0007` must already be applied; use the documented `pnpm db:migrate` upgrade procedure after reviewing/backing up the target database. This phase does not apply migrations to the application database.

Saturday–Friday weeks, Gregorian storage/Jalali presentation, current-department attribution, exact hours, lock enforcement, audit writes and ownership are unchanged. Locking does not snapshot department or names. The new views are operational summaries, not attendance or payroll indicators.

## Scope decisions and remaining debt

Saved report views are omitted: existing validated bookmarkable URLs provide a low-risk convenience without adding another persistent resource and authorization lifecycle. No chart package, approval workflow, notification, manager scope or external integration was introduced.

Employee project/file option APIs still load their existing active lists; searching filters those lists locally. This is reasonable at current scale but would benefit from bounded server search if master lists become very large. Master-data administration lists remain unpaginated. Missing-report names are a bounded preview rather than a new roster module. No audit retention policy or historical department snapshots were added.

## Validation

- `pnpm test`: 14 unit tests passed, including auth/LDAP/session, dates, decimals and XLSX safety.
- `pnpm test:integration`: 33 tests passed against isolated PostgreSQL schemas/transactions. Added deterministic dashboard coverage for auth, ownership, week/date boundaries, exact 6.5/10.5 totals, inactive historical users/projects, missing active employees with/without departments, excluded admin/inactive accounts, and locked readability. No application data was modified.
- Small fixture business dashboard query observed approximately 82–83 ms; not a production load benchmark. Results and dropdown queries remain bounded. Existing 500/3,000-row export integration checks remain green.
- `pnpm build`, `pnpm test:system`, `pnpm lint`, `pnpm typecheck` and `pnpm format:check`: passed. Production HTTP checks include role-specific dashboards, entry-editor controls, reset/filter controls, existing auth/session and IT permissions, concurrent saves/locks, audit and real XLSX responses. HTTP checks are not visual browser QA.
- HTTP testing caught a loading-boundary regression (anonymous dashboard response streamed before redirecting). A dashboard layout now resolves authentication before its loading boundary; anonymous requests retain the expected 307 login redirect. No report data was exposed.

## Manual QA checklist — pending browser availability

No connected browser was available during implementation (browser discovery returned no instances). Do not treat source review or HTTP tests as visual/keyboard QA. Run this checklist before company rollout:

1. **Employee desktop, 1440/1280 px:** log in, verify today/week numbers against own reports, empty week wording and department identity; create today's report, add five rows, search project/file codes, use decimal Persian/Latin input, duplicate/change/remove rows, save and revisit. Confirm copied IDs never update the original.
2. **Keyboard:** Tab through header/forms; open searchable selects with Enter/arrow, search, choose using arrows/Enter, Escape back to trigger, Tab onward. Add-row must focus its project field. Open Jalali calendar, verify focused date, Tab/Shift-Tab containment, Escape restoration and readable labels. Verify no inaccessible controls in scrolled tables.
3. **Dirty form:** edit then revert (no warning), edit then click header/day links (confirm), cancel departure (retain rows), refresh/close (browser warning), save (success and no dirty warning). Browser history navigation remains a documented limitation.
4. **Business admin:** compare dashboard totals/groups to current-week report and Excel metadata; combine all filters, remove one chip, reset all, navigate weeks/custom dates, paginate both tables, download detail and grouped XLSX. Confirm export uses applied URL filters, not unsaved filter selections. Check missing-reporter wording avoids attendance claims.
5. **Locks:** lock a full week with confirmation; employee dashboard/history/editor clearly show read-only. Stale open form save is rejected. Reports/exports still work. Unlock and refresh restores owned edits. Multi-week custom ranges must not offer ambiguous locking.
6. **IT:** manage users/roles/departments/projects/files, cancel and confirm deactivation, check feedback/duplicates, inspect paginated audit before/after records. Employee/business accounts must not see IT links or access IT routes.
7. **RTL/Jalali:** Persian names alongside `P-001`, `PID-001`, long mixed descriptions, fractional totals, year/month boundaries, and Tehran today near midnight. Verify pagination directions and calendar selection across months.
8. **Widths 1024/768/390/360 px:** navigation wraps; dashboard cards and filters fit; wide tables scroll horizontally within their containers; footer does not hide final row; dropdown/calendar stays usable near viewport edges. Check zoom 200% and visible keyboard focus.
9. **Failures:** network interruption while fetching files/saving/exporting, expired session, locked rejection and concurrent edit conflict. Confirm Persian feedback, retained work draft, retry behavior and no SQL/stack trace exposure.
10. **Excel:** open actual exported file in Microsoft Excel, confirm Persian text/RTL, numeric hours and exact totals; automated workbook parsing already covers structural validity.

Live LDAP credentials and native Excel were not available for manual verification; existing automated LDAP/session and workbook tests remain the validation evidence.
