const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { randomUUID } = require("node:crypto");
const postgres = require("postgres");
const { drizzle } = require("drizzle-orm/postgres-js");
const { sql: querySql } = require("drizzle-orm");
const { load } = require("./helpers.cjs");
require("@next/env").loadEnvConfig(process.cwd());

test("production scale and expired-session maintenance on a fresh isolated PostgreSQL schema", async () => {
  const client = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
  const scratch = `production_${randomUUID().replaceAll("-", "")}`;
  const rollback = new Error("isolated rollback");
  const schema = load("src/db/schema.ts");
  const root = drizzle(client, { schema });
  try {
    await root.transaction(async (database) => {
      const tx = (strings, ...values) => database.execute(querySql(strings, ...values));
      tx.unsafe = (text) => database.execute(querySql.raw(text));
      await tx.unsafe(`CREATE SCHEMA "${scratch}"`);
      await tx.unsafe(`SET LOCAL search_path TO "${scratch}", pg_catalog`);
      for (const entry of JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")).entries) {
        const source = readFileSync(`drizzle/${entry.tag}.sql`, "utf8")
          .replaceAll('"public"', `"${scratch}"`)
          .replaceAll('"legacy_letter_list"', `"${scratch}_archive"`);
        for (const statement of source.split("--> statement-breakpoint"))
          if (statement.trim()) await tx.unsafe(statement);
      }
      await tx`UPDATE users SET active=false WHERE ldap_id LIKE 'pending:%'`;
      await tx`INSERT INTO departments(name,code) SELECT 'Department '||n, 'D'||n FROM generate_series(1,20) n`;
      await tx`INSERT INTO projects(name,code,is_active) SELECT 'Project '||n, 'P'||n,n<=18 FROM generate_series(1,20) n`;
      await tx`INSERT INTO project_files(project_id,name,code) SELECT p.id,'File '||n,'F'||n FROM projects p CROSS JOIN generate_series(1,10) n`;
      await tx`INSERT INTO users(ldap_id,username,display_name,department_id) SELECT 'CN=perf-'||n,'perf-'||n,'Employee '||n,d.id FROM generate_series(1,100) n JOIN departments d ON d.code='D'||(((n-1)%20)+1)`;
      await tx`INSERT INTO work_entries(employee_id,work_date,project_id,project_file_id,description,man_hours)
      SELECT u.id,DATE '2026-01-03'+((n-1)/200)::int,p.id,f.id,'Synthetic work',CASE WHEN n%2=0 THEN 0.25 ELSE 1.25 END
      FROM generate_series(1,14000) n JOIN users u ON u.username='perf-'||(((n-1)%100)+1)
      JOIN projects p ON p.code='P'||(((n-1)%20)+1) JOIN project_files f ON f.project_id=p.id AND f.code='F'||(((n-1)%10)+1)`;
      await tx`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,new_data) SELECT employee_id,'WORK_ENTRY_CREATED','WORK_ENTRY',id,jsonb_build_object('manHours',man_hours,'description',description) FROM work_entries`;
      for (const table of [
        "users",
        "projects",
        "project_files",
        "departments",
        "work_entries",
        "audit_logs",
      ])
        await tx.unsafe(`ANALYZE "${table}"`);
      const [person] = await tx`SELECT id FROM users WHERE username='perf-1'`;
      const dates = load("src/lib/work-reporting.ts");
      const mocks = {
        "@/db": { db: database },
        "@/db/schema": schema,
        "@/lib/work-reporting": { ...dates, todayInTehran: () => "2026-01-05" },
        "@/lib/auth": {
          requireUser: async () => ({ id: person.id, role: "EMPLOYEE" }),
          requireRole: async () => ({ id: person.id, role: "IT_ADMIN" }),
        },
      };
      const reporting = load("src/lib/business-reports.ts", mocks);
      const dashboards = load("src/lib/dashboards.ts", mocks);
      const audit = load("src/lib/audit-viewer.ts", mocks);
      const { parseBusinessReportQuery: parse } = load("src/lib/business-report-query.ts");
      const { parseAuditQuery } = load("src/lib/audit-query.ts");
      const query = parse({
        from: "2026-01-03",
        to: "2026-01-09",
        groupBy: "project",
        groupBySecondary: "employee",
      });
      const timings = {};
      async function measure(name, fn) {
        const start = performance.now();
        const result = await fn();
        timings[name] = Math.round(performance.now() - start);
        return result;
      }
      const employee = await measure("employeeDashboardMs", () =>
        dashboards.getEmployeeDashboard(),
      );
      assert.equal(employee.week.count, 14);
      assert.equal(employee.week.totalHundredths, 1750);
      const report = await measure("groupedReportMs", () => reporting.getBusinessReport(query));
      assert.equal(report.entryCount, 1400);
      assert.equal(report.totalHours, "1050.00");
      assert.equal(report.entries.length, 50);
      const business = await measure("businessDashboardMs", () =>
        dashboards.getBusinessDashboard(),
      );
      assert.equal(business.report.totalHours, report.totalHours);
      assert.deepEqual(business.counts, { reporters: 100, missing: 0, activeProjects: 18 });
      const logs = await measure("auditPageMs", () =>
        audit.getAuditLogs(
          parseAuditQuery({ from: dates.todayInTehran(), to: dates.todayInTehran() }),
        ),
      );
      assert.equal(logs.count, 14000);
      const exported = await measure("exportQueryMs", () =>
        reporting.getBusinessReportExport(
          parse({ from: "2026-01-03", to: "2026-03-13" }),
          "details",
        ),
      );
      assert.equal(exported.entryCount, 14000);
      assert.equal(exported.entries.length, 14000);
      assert.equal(exported.totalHours, "10500.00");
      const before = process.memoryUsage().rss;
      const workbook = await measure("xlsxMs", () =>
        load("src/lib/report-workbook.ts").createReportWorkbook(exported, "details"),
      );
      const sheets = await require("read-excel-file/node")(workbook);
      assert.equal(sheets[0].data.length, 14001);
      timings.xlsxBytes = workbook.length;
      timings.xlsxRssDeltaMiB = Math.round((process.memoryUsage().rss - before) / 1048576);
      for (const [name, query] of [
        [
          "employeePlan",
          tx`EXPLAIN (ANALYZE, FORMAT JSON) SELECT sum(man_hours) FROM work_entries WHERE employee_id=${person.id} AND work_date BETWEEN DATE '2026-01-03' AND DATE '2026-01-09'`,
        ],
        [
          "datePlan",
          tx`EXPLAIN (ANALYZE, FORMAT JSON) SELECT sum(man_hours) FROM work_entries WHERE work_date BETWEEN DATE '2026-01-03' AND DATE '2026-01-09'`,
        ],
        [
          "auditPlan",
          tx`EXPLAIN (ANALYZE, FORMAT JSON) SELECT id FROM audit_logs ORDER BY created_at DESC,id DESC LIMIT 50`,
        ],
      ]) {
        const plan = (await query)[0]["QUERY PLAN"][0];
        timings[name + "Ms"] = plan["Execution Time"];
        console.log(name, JSON.stringify(plan.Plan));
      }
      const { cleanupExpiredSessions } = await import("../scripts/lib/session-maintenance.mjs");
      await tx`INSERT INTO sessions(user_id,token_hash,expires_at) VALUES (${person.id},'expired-fixture',now()-interval '1 day'),(${person.id},'valid-fixture',now()+interval '1 day')`;
      assert.equal(await cleanupExpiredSessions(tx), 1);
      assert.equal(await cleanupExpiredSessions(tx), 0);
      assert.equal((await tx`SELECT token_hash FROM sessions`)[0].token_hash, "valid-fixture");
      console.log(
        "Production fixture: 100 employees, 20 departments/projects, 200 files, 14000 entries/audits",
        JSON.stringify(timings),
      );
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    await client.end();
  }
});
