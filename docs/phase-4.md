# Phase 4: reporting exports

## Architecture and scope

GET `/api/admin/reports/export?mode=details|summary&...` validates the existing reporting URL model after extracting the required allowlisted mode. Both page actions use the applied URL query. Direct requests independently check `requireApiRole(...REPORT_ROLES)`; BUSINESS_ADMIN and IT_ADMIN are allowed, EMPLOYEE receives 403, and anonymous/expired sessions receive 401. IT master permissions and personal ownership are unchanged. No approval, locking, export history, queue, notification, saved view, CSV or PDF feature is added.

`report-export-query.ts` holds mode/filename/URL and limit definitions; `report-export-api.ts` handles safe HTTP delivery; `report-workbook.ts` generates Node-only XLSX; `ReportExportActions` provides busy/error/download behavior. Client imports are restricted to lightweight shared query helpers. The writer's Node entry point is imported only by the server generator, not the client graph. Buffers are returned in memory with the XLSX MIME type, `Content-Disposition: attachment`, `private, no-store` and `nosniff`. Safe filenames contain only validated mode and ISO date ranges. No filesystem paths or user names are accepted for filenames; no temporary files are written by the route.

## Single reporting engine

The Phase 3 service now has a private shared runner behind `getBusinessReport()` and `getBusinessReportExport()`. Both use exactly the same filter predicate, many-to-one joins, allowlisted sort columns and SQL grouping definitions. Export mode changes only limits/offsets and which result set is needed. It also resolves human-readable filter labels in the same read-only REPEATABLE READ snapshot. No separate export WHERE builder or client-side aggregation exists.

All date, employee, department, project and project-file filters combine identically. Detail export preserves sort/direction and stable tie-breakers. Pagination is still validated but ignored: both detail and group offsets become zero, with complete matching data subject to the hard cap. Summary preserves primary/secondary grouping and contextual project-file labels; groups remain keyed by stable IDs internally. With no grouping, the summary has one overall row. The entire source count is checked before fetching output rows: more than 20,000 matching entries rejects either mode with 422, never truncates. Summary mode skips descriptions/detail rows; detail mode skips grouping work.

Current-department attribution is unchanged. Moving employees changes past attribution just as on screen. Inactive employees/projects/files are included; current names and project context remain intact. Exports do not snapshot historical department/name changes. Totals match screen queries for the same database state, but separate requests can naturally differ after intervening work-entry edits. An individual export remains internally consistent.

## Workbook contents and safety

Detailed sheet `گزارش تفصیلی`: Jalali date, employee name, employee code, username, current department, project code, project name, contextual project file, description, numeric man-hours. IDs and LDAP/session secrets are excluded. Codes remain strings, preserving leading zeroes.

Summary sheet `خلاصه`: primary label, optional secondary label, numeric entry count and numeric man-hours. Flat rows have no merged cells or repeated primary-total column, so summing grouped hours does not double-count. Date groups use the same Jalali presentation as details.

Both include `مشخصات گزارش`: type, inclusive Jalali range, explicit ISO range, UTC generation timestamp, source count/total, grouping, sort, selected filter labels and current-department/fresh-snapshot notes. Unknown selected IDs are labelled missing rather than described as "all". Overall totals are server-calculated constants and explicitly do not recalculate after workbook editing. No formulas are needed.

Persian headers, RTL sheets, frozen headers, dark high-contrast header fill, wrapped text and column widths support Excel use. Dates are unambiguous Persian-digit YYYY/MM/DD text, not Excel serial dates; the ISO range is also recorded. Hours are PostgreSQL numeric strings until one numeric-cell conversion, with a two-decimal format. No JS fractional summation occurs. Counts are integral numeric cells. Precision guards keep values below Excel's significant-digit limit; the source-row cap implies a much smaller normal total (at most 480,000 hours).

Every user value passes through an explicit String cell constructor. In addition, formula-like leading `=`, `+`, `-`, `@`, including after whitespace/common bidi marks, gets a leading apostrophe. The apostrophe can be visible, intentionally preserving safety across downstream copying. User content is never passed as Formula or hyperlink objects. XML-illegal control characters are removed; text above the Excel cell limit is rejected with a safe error instead of silently losing content. This is XLSX-only protection; a future CSV implementation must implement its own escaping rules.

## Dependency review

Selected `write-excel-file` 4.1.1: Node >=18 support, typed string/number cells, multiple sheets, RTL and frozen headers, in-memory output, and one runtime dependency (`fflate`). npm metadata reported modification on 2026-06-08. The maintained narrow writer is sufficient without a broader spreadsheet-editing framework. `read-excel-file` 9.3.10 is a development dependency used to parse real generated workbooks. Versions are pinned in package.json and pnpm-lock.yaml. No unrelated dependency upgrades or audit workflow were introduced. See the [writer documentation](https://www.npmjs.com/package/write-excel-file) and [reader documentation](https://www.npmjs.com/package/read-excel-file).

## Validation and performance

Tests parse actual XLSX bytes and check worksheet names, Persian headers/text, data row counts, numeric quarter-hour values, leading-zero codes, formula-like text safety, empty output and metadata totals. PostgreSQL fixtures compare every individual/combined filter and all five grouping dimensions, plus project→employee, department→project and employee→file, against the screen engine. Detail exports include 60 rows despite a 25-row page; grouped exports include 30 pairs despite group page 2. Inactive historical values, department reassignment and equal file names across projects are covered. Both modes reject 20,001 source rows. Production HTTP tests parse the actual response bytes, check direct authorization, safe filenames, query rejection and pagination independence.

Representative local synthetic measurement (short Persian descriptions): 500 rows queried in ~40 ms and generated in ~93 ms, 19,960-byte workbook; 3,000 rows queried in ~76 ms and generated in ~387 ms, 90,125-byte workbook. The latter net process RSS change including read-back was ~8 MiB. This is not a peak-memory or production concurrency benchmark; GC can produce negative deltas and long descriptions increase cost. The synchronous 20,000-source-row limit is a practical safety boundary, not a promise that every request costs the same. Several simultaneous exports can increase memory; no global/distributed throttling or jobs were added.

No schema/migration changes or application-database mutations were made in Phase 4. Full migration replay is checked in isolated schemas. Native Microsoft Excel visual verification and interactive browser download testing remain manual checks; automated validity is demonstrated by independent workbook parsing and production HTTP requests. Existing LDAP tests pass without changing LDAP implementation, but no live company LDAP credentials were used. Inherited operational debt and historical-attribution limitations remain as documented in Phase 3.

Completed validation: `pnpm test` (13 passed), `pnpm test:integration` (25 passed including parent suites), `pnpm test:system` (including actual HTTP XLSX parsing), `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm build`, `pnpm db:check-migrations`, `pnpm exec drizzle-kit check`, and `pnpm install --frozen-lockfile --offline` all passed.
