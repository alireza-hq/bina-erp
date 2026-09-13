import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  EXPORT_MAX_ROWS,
  ReportExportLimitError,
  exportModeSchema,
  type ExportMode,
} from "@/lib/report-export-query";
import {
  workEntries as w,
  users as u,
  departments as d,
  projects as p,
  projectFiles as f,
} from "@/db/schema";
import {
  businessReportSchema,
  reportOptionsSchema,
  type BusinessReportQuery,
} from "@/lib/business-report-query";

const source = sql`${w} JOIN ${u} ON ${w.employeeId} = ${u.id} LEFT JOIN ${d} ON ${u.departmentId} = ${d.id} JOIN ${p} ON ${w.projectId} = ${p.id} JOIN ${f} ON ${w.projectFileId} = ${f.id}`;
const employeeLabel = sql`${u.displayName} || ' / ' || ${u.username} || coalesce(' / ' || ${u.employeeCode}, '')`;
const projectLabel = sql`${p.code} || ' — ' || ${p.name}`;
const fileLabel = sql`${p.code} || ' — ' || ${p.name} || ' / ' || ${f.code} || ' — ' || ${f.name}`;
const dimensions = {
  employee: { key: sql`${u.id}::text`, label: employeeLabel },
  department: {
    key: sql`coalesce(${d.id}::text, 'unassigned')`,
    label: sql`coalesce(${d.name}, 'بدون واحد')`,
  },
  project: { key: sql`${p.id}::text`, label: projectLabel },
  projectFile: { key: sql`${f.id}::text`, label: fileLabel },
  date: { key: sql`${w.workDate}::text`, label: sql`${w.workDate}::text` },
};
const sortColumns = {
  date: w.workDate,
  employee: u.displayName,
  department: d.name,
  project: p.name,
  projectFile: f.code,
  manHours: w.manHours,
};
function predicate(q: BusinessReportQuery) {
  const parts: SQL[] = [sql`${w.workDate} >= ${q.from}::date`, sql`${w.workDate} <= ${q.to}::date`];
  for (const [value, column] of [
    [q.employeeId, w.employeeId],
    [q.departmentId, u.departmentId],
    [q.projectId, w.projectId],
    [q.projectFileId, w.projectFileId],
  ] as const)
    if (value) parts.push(sql`${column} = ${value}::uuid`);
  return sql.join(parts, sql` AND `);
}
export type ReportEntry = {
  id: string;
  date: string;
  employee: string;
  employeeName: string;
  employeeCode: string | null;
  username: string;
  department: string;
  project: string;
  projectCode: string;
  projectName: string;
  projectFile: string;
  description: string;
  manHours: string;
};
export type ReportGroup = {
  primaryKey: string;
  primaryLabel: string;
  secondaryKey: string;
  secondaryLabel: string;
  totalHours: string;
  entryCount: string;
  primaryHours: string;
  primaryCount: string;
  groupCount: string;
};
export async function getBusinessReport(
  input: BusinessReportQuery,
  connection: Pick<typeof db, "transaction"> = db,
) {
  return runBusinessReport(input, undefined, connection);
}
export async function getBusinessReportExport(input: BusinessReportQuery, mode: ExportMode) {
  return runBusinessReport(input, exportModeSchema.parse(mode));
}
async function runBusinessReport(
  input: BusinessReportQuery,
  exportMode?: ExportMode,
  connection: Pick<typeof db, "transaction"> = db,
) {
  const q = businessReportSchema.parse(input);
  // One snapshot makes the paged rows, total and groups consistent during concurrent edits.
  return connection.transaction(
    async (tx) => {
      const where = predicate(q);
      const [total] = await tx.execute<{ totalHours: string; entryCount: string }>(
        sql`SELECT coalesce(sum(${w.manHours}),0)::text AS "totalHours", count(*)::text AS "entryCount" FROM ${source} WHERE ${where}`,
      );
      if (exportMode && BigInt(total.entryCount) > BigInt(EXPORT_MAX_ROWS))
        throw new ReportExportLimitError();
      const entries =
        exportMode === "summary"
          ? []
          : await tx.execute<ReportEntry>(
              sql`SELECT ${w.id} AS id, ${w.workDate}::text AS date, ${employeeLabel} AS employee, ${u.displayName} AS "employeeName", ${u.employeeCode} AS "employeeCode", ${u.username} AS username, coalesce(${d.name}, 'بدون واحد') AS department, ${projectLabel} AS project, ${p.code} AS "projectCode", ${p.name} AS "projectName", ${fileLabel} AS "projectFile", ${w.description} AS description, ${w.manHours}::text AS "manHours" FROM ${source} WHERE ${where} ORDER BY ${sortColumns[q.sort]} ${q.direction === "asc" ? sql`ASC` : sql`DESC`} NULLS LAST, ${u.displayName} ASC, ${w.id} ASC LIMIT ${exportMode ? EXPORT_MAX_ROWS : q.pageSize} OFFSET ${exportMode ? 0 : (q.page - 1) * q.pageSize}`,
            );
      let groups: ReportGroup[] = [];
      let groupCount = 0;
      if (q.groupBy && exportMode !== "details") {
        const primary = dimensions[q.groupBy];
        const secondary = q.groupBySecondary
          ? dimensions[q.groupBySecondary]
          : { key: sql`''::text`, label: sql`''::text` };
        const grouped = sql`SELECT ${primary.key} AS "primaryKey", ${primary.label} AS "primaryLabel", ${secondary.key} AS "secondaryKey", ${secondary.label} AS "secondaryLabel", sum(${w.manHours}) AS hours, count(*) AS entries FROM ${source} WHERE ${where} GROUP BY 1,2,3,4`;
        const [count] = await tx.execute<{ count: string }>(
          sql`WITH grouped AS (${grouped}) SELECT count(*)::text AS count FROM grouped`,
        );
        groupCount = Number(count.count);
        groups = await tx.execute<ReportGroup>(
          sql`WITH grouped AS (${grouped}) SELECT "primaryKey", "primaryLabel", "secondaryKey", "secondaryLabel", hours::text AS "totalHours", entries::text AS "entryCount", (sum(hours) OVER (PARTITION BY "primaryKey"))::text AS "primaryHours", (sum(entries) OVER (PARTITION BY "primaryKey"))::text AS "primaryCount", count(*) OVER ()::text AS "groupCount" FROM grouped ORDER BY "primaryLabel", "primaryKey", "secondaryLabel", "secondaryKey" LIMIT ${exportMode ? EXPORT_MAX_ROWS : q.pageSize} OFFSET ${exportMode ? 0 : (q.groupPage - 1) * q.pageSize}`,
        );
      }
      // Filter labels are resolved in the same snapshot, including filters matching zero rows.
      let filterLabels: Record<string, string | null> = {};
      if (exportMode || q.employeeId || q.departmentId || q.projectId || q.projectFileId) {
        const [labels] = await tx.execute<Record<string, string | null>>(sql`SELECT
          (SELECT ${employeeLabel} FROM ${u} WHERE ${u.id} = ${q.employeeId ?? null}::uuid) AS employee,
          (SELECT ${d.name} FROM ${d} WHERE ${d.id} = ${q.departmentId ?? null}::uuid) AS department,
          (SELECT ${projectLabel} FROM ${p} WHERE ${p.id} = ${q.projectId ?? null}::uuid) AS project,
          (SELECT ${fileLabel} FROM ${f} JOIN ${p} ON ${f.projectId} = ${p.id} WHERE ${f.id} = ${q.projectFileId ?? null}::uuid) AS "projectFile"`);
        filterLabels = labels;
      }
      return {
        filterLabels,
        query: q,
        totalHours: total.totalHours,
        entryCount: Number(total.entryCount),
        entries: Array.from(entries),
        groups: Array.from(groups),
        groupCount,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export type ReportOption = { value: string; label: string };
export async function getReportFilterOptions(input: unknown) {
  const q = reportOptionsSchema.parse(input);
  const config = {
    employee: {
      source: sql`${u} LEFT JOIN ${d} ON ${u.departmentId} = ${d.id}`,
      id: u.id,
      label: sql`${employeeLabel} || ' / ' || coalesce(${d.name}, 'بدون واحد')`,
      active: u.isActive,
    },
    department: { source: sql`${d}`, id: d.id, label: sql`${d.name}`, active: d.isActive },
    project: { source: sql`${p}`, id: p.id, label: projectLabel, active: p.isActive },
    projectFile: {
      source: sql`${f} JOIN ${p} ON ${f.projectId} = ${p.id}`,
      id: f.id,
      label: fileLabel,
      active: sql`${f.isActive} AND ${p.isActive}`,
    },
  }[q.kind];
  const restrictions: SQL[] = [sql`true`];
  if (q.kind === "employee" && q.departmentId)
    restrictions.push(sql`${u.departmentId} = ${q.departmentId}::uuid`);
  if (q.kind === "projectFile" && q.projectId)
    restrictions.push(sql`${f.projectId} = ${q.projectId}::uuid`);
  const label = sql`${config.label} || CASE WHEN ${config.active} THEN '' ELSE ' (غیرفعال)' END`;
  // Literal substring search, not user-controlled SQL or wildcard patterns.
  const rows = await db.execute<ReportOption>(
    sql`SELECT ${config.id} AS value, ${label} AS label FROM ${config.source} WHERE ${sql.join(restrictions, sql` AND `)} AND (strpos(lower(${label}), lower(${q.search})) > 0 OR ${config.id} = ${q.selected ?? null}::uuid) ORDER BY (${config.id} = ${q.selected ?? null}::uuid) DESC NULLS LAST, ${config.label}, ${config.id} LIMIT 51`,
  );
  return { options: Array.from(rows).slice(0, 50), more: rows.length > 50 };
}
